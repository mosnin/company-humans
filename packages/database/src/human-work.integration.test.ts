import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createCanonicalId } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";
import {
  completeHumanAssignment, createHumanAssignment, HumanWorkConflict, HumanWorkDenied,
  listAssignableMembers, listHumanAssignments,
} from "./human-work.js";

const databaseUrl = process.env.DATABASE_URL;

async function makeLogin(admin: Client, prefix: string, suffix: string, grant: "company_human_app" | "company_human_service") {
  const name = `${prefix}_${suffix}`;
  const password = randomBytes(16).toString("hex");
  await admin.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}'`);
  await admin.query(`GRANT ${grant} TO ${name}`);
  const url = new URL(databaseUrl!);
  url.username = name;
  url.password = password;
  return { name, url: url.toString(), grant };
}
async function cleanupImmutable(admin: Client, table: string, trigger: string, organizations: string[]) {
  await admin.query("BEGIN");
  try {
    await admin.query(`ALTER TABLE public.${table} DISABLE ROW LEVEL SECURITY`);
    await admin.query(`ALTER TABLE public.${table} DISABLE TRIGGER ${trigger}`);
    await admin.query(`DELETE FROM public.${table} WHERE organization_id=ANY($1)`, [organizations]);
    await admin.query(`ALTER TABLE public.${table} ENABLE TRIGGER ${trigger}`);
    await admin.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await admin.query("COMMIT");
  } catch (error) { await admin.query("ROLLBACK"); throw error; }
}

describe.skipIf(!databaseUrl)("native Human Work", () => {
  it("enforces module, team, assignee and tenant boundaries with immutable reported completion", async () => {
    const suffix = randomBytes(5).toString("hex");
    const identities = await Promise.all(["owner", "manager", "alice", "bob", "outsider"].map(async label =>
      syncAuthUser(databaseUrl!, { authIssuer: "https://identity.example.test", authSubject: `hwork-${label}-${suffix}`,
        primaryEmail: null, displayName: label, status: "active", eventTimestamp: 1 })));
    const [owner, manager, alice, bob, outsider] = identities;
    const org = await createOrganization(databaseUrl!, { ownerUserId: owner!, slug: `hwork-a-${suffix}`, name: "Human Work A" });
    const foreign = await createOrganization(databaseUrl!, { ownerUserId: outsider!, slug: `hwork-b-${suffix}`, name: "Human Work B" });
    const [managerMember, aliceMember, bobMember] = [createCanonicalId("membership"), createCanonicalId("membership"), createCanonicalId("membership")];
    const [team, otherTeam] = [createCanonicalId("team"), createCanonicalId("team")];
    const organizations = [org.organizationId, foreign.organizationId];
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    const logins: Awaited<ReturnType<typeof makeLogin>>[] = [];
    try {
      for (const [member, user, role] of [[managerMember, manager, "manager"], [aliceMember, alice, "contributor"],
        [bobMember, bob, "contributor"]] as const) {
        await admin.query(`INSERT INTO public.memberships(id,organization_id,user_id,status,role_key)
          VALUES($1,$2,$3,'active',$4)`, [member, org.organizationId, user, role]);
      }
      await admin.query("INSERT INTO public.teams(id,organization_id,name) VALUES($1,$2,'Sales'),($3,$2,'Other')",
        [team, org.organizationId, otherTeam]);
      await admin.query(`INSERT INTO public.team_memberships(organization_id,team_id,membership_id,team_role)
        VALUES($1,$2,$3,'manager'),($1,$2,$4,'member'),($1,$5,$6,'member')`, [org.organizationId, team, managerMember, aliceMember, otherTeam, bobMember]);
      const app = await makeLogin(admin, "ch_hwork_app", suffix, "company_human_app");
      const service = await makeLogin(admin, "ch_hwork_service", suffix, "company_human_service");
      logins.push(app, service);
      const base = { organizationId: org.organizationId, assigneeMembershipId: aliceMember,
        teamId: team, title: "Call lead", objective: "Book a meeting with the lead",
        dueAt: "2026-10-01T15:30:00Z", priority: "high" as const,
        expectedOutcome: "Meeting booked or objection recorded", evidenceRequired: true };

      const managerChoices = await listAssignableMembers(service.url, { actorUserId: manager!, organizationId: org.organizationId, teamId: null });
      expect(managerChoices).toEqual([{ membershipId: aliceMember, displayName: "alice", teamId: team, teamName: "Sales" },
        { membershipId: managerMember, displayName: "manager", teamId: team, teamName: "Sales" }]);
      expect(managerChoices.some(choice => choice.membershipId === bobMember || choice.teamId === null)).toBe(false);
      const ownerChoices = await listAssignableMembers(service.url, { actorUserId: owner!, organizationId: org.organizationId, teamId: null });
      expect(ownerChoices.some(choice => choice.membershipId === bobMember && choice.teamId === otherTeam)).toBe(true);
      expect(ownerChoices.some(choice => choice.membershipId === bobMember && choice.teamId === null)).toBe(true);

      await expect(createHumanAssignment(service.url, { ...base, actorUserId: manager!, teamId: null })).rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(createHumanAssignment(service.url, { ...base, actorUserId: manager!, assigneeMembershipId: bobMember })).rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(createHumanAssignment(service.url, { ...base, actorUserId: alice! })).rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(createHumanAssignment(service.url, { ...base, actorUserId: outsider! })).rejects.toBeInstanceOf(HumanWorkDenied);
      const assignment = await createHumanAssignment(service.url, { ...base, actorUserId: manager! });
      expect(assignment.source).toBe("manager");
      expect(assignment.completion).toBeNull();
      expect(assignment.assigneeDisplayName).toBe("alice");
      const unteamed = await createHumanAssignment(service.url, { ...base, actorUserId: owner!, teamId: null,
        assigneeMembershipId: bobMember, evidenceRequired: false, title: "Follow up" });
      expect(unteamed.teamId).toBeNull();

      expect((await listHumanAssignments(app.url, { actorUserId: alice!, organizationId: org.organizationId, scope: "own" })).items.map(row => row.id)).toEqual([assignment.id]);
      expect((await listHumanAssignments(app.url, { actorUserId: bob!, organizationId: org.organizationId, scope: "own" })).items.map(row => row.id)).toEqual([unteamed.id]);
      expect((await listHumanAssignments(service.url, { actorUserId: manager!, organizationId: org.organizationId, scope: "team" })).items.map(row => row.id)).toEqual([assignment.id]);
      await expect(listHumanAssignments(service.url, { actorUserId: manager!, organizationId: org.organizationId, scope: "all" })).rejects.toBeInstanceOf(HumanWorkDenied);
      expect((await listHumanAssignments(service.url, { actorUserId: owner!, organizationId: org.organizationId, scope: "all" })).items.map(row => row.id).sort())
        .toEqual([assignment.id, unteamed.id].sort());
      const firstPage = await listHumanAssignments(service.url, { actorUserId: owner!, organizationId: org.organizationId,
        scope: "all", pageSize: 1 });
      expect(firstPage.items).toHaveLength(1);
      expect(firstPage.nextOffset).toBe(1);
      const secondPage = await listHumanAssignments(service.url, { actorUserId: owner!, organizationId: org.organizationId,
        scope: "all", pageSize: 1, offset: firstPage.nextOffset! });
      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.nextOffset).toBeNull();
      expect([firstPage.items[0]?.id, secondPage.items[0]?.id].sort()).toEqual([assignment.id, unteamed.id].sort());
      await expect(listHumanAssignments(app.url, { actorUserId: outsider!, organizationId: org.organizationId, scope: "own" })).rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(listHumanAssignments(app.url, { actorUserId: alice!, organizationId: foreign.organizationId, scope: "own" })).rejects.toBeInstanceOf(HumanWorkDenied);

      await expect(completeHumanAssignment(service.url, { actorUserId: manager!, organizationId: org.organizationId,
        assignmentId: assignment.id, outcome: "Meeting booked", evidence: "Call log 42" })).rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(completeHumanAssignment(service.url, { actorUserId: owner!, organizationId: org.organizationId,
        assignmentId: assignment.id, outcome: "Meeting booked", evidence: "Call log 42" })).rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(completeHumanAssignment(service.url, { actorUserId: alice!, organizationId: org.organizationId,
        assignmentId: assignment.id, outcome: "Meeting booked", evidence: null })).rejects.toBeInstanceOf(HumanWorkDenied);
      const completed = await completeHumanAssignment(service.url, { actorUserId: alice!, organizationId: org.organizationId,
        assignmentId: assignment.id, outcome: "Meeting booked", evidence: "Call log 42" });
      expect(completed.completion?.outcome).toBe("Meeting booked");
      expect(completed.completion?.evidence).toBe("Call log 42");
      await expect(completeHumanAssignment(service.url, { actorUserId: alice!, organizationId: org.organizationId,
        assignmentId: assignment.id, outcome: "Changed answer", evidence: "Changed evidence" })).rejects.toBeInstanceOf(HumanWorkConflict);
      expect((await listHumanAssignments(app.url, { actorUserId: alice!, organizationId: org.organizationId, scope: "own" })).items[0]?.completion?.outcome)
        .toBe("Meeting booked");
      const competing = await Promise.allSettled([
        completeHumanAssignment(service.url, { actorUserId: bob!, organizationId: org.organizationId,
          assignmentId: unteamed.id, outcome: "First report", evidence: null }),
        completeHumanAssignment(service.url, { actorUserId: bob!, organizationId: org.organizationId,
          assignmentId: unteamed.id, outcome: "Second report", evidence: null }),
      ]);
      expect(competing.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(competing.filter(result => result.status === "rejected")).toHaveLength(1);
      expect(competing.find(result => result.status === "rejected")?.reason).toBeInstanceOf(HumanWorkConflict);

      // The database triggers also fence direct SQL and append the audit in
      // the same transaction as each accepted fact.
      const direct = new Client({ connectionString: service.url });
      await direct.connect();
      try {
        await direct.query("BEGIN");
        await direct.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
          [manager, org.organizationId]);
        await expect(direct.query(`INSERT INTO public.human_assignments
          (id,organization_id,assignee_membership_id,team_id,created_by_user_id,created_by_membership_id,title,objective,priority,expected_outcome)
          VALUES($1,$2,$3,$4,$5,$6,'Forged','Forged','normal','Forged')`,
        [createCanonicalId("humanAssignment"), org.organizationId, bobMember, otherTeam, manager, managerMember])).rejects.toThrow();
        await direct.query("ROLLBACK");
        await direct.query("BEGIN");
        await direct.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
          [manager, org.organizationId]);
        await expect(direct.query("UPDATE public.human_assignments SET title='Changed' WHERE id=$1", [assignment.id])).rejects.toThrow();
        await direct.query("ROLLBACK");
      } finally { await direct.end(); }
      const audits = await admin.query("SELECT action,actor_user_id FROM public.identity_audit_events WHERE organization_id=$1 AND action LIKE 'human_assignment.%' ORDER BY occurred_at", [org.organizationId]);
      expect(audits.rows.filter(row => row.action === "human_assignment.created")).toHaveLength(2);
      expect(audits.rows.filter(row => row.action === "human_assignment.completion_reported")).toHaveLength(2);

      const transition = new Client({ connectionString: databaseUrl });
      await transition.connect();
      try {
        await transition.query("BEGIN");
        await transition.query(`UPDATE public.team_memberships SET ended_at=clock_timestamp()
          WHERE organization_id=$1 AND team_id=$2 AND membership_id=$3`, [org.organizationId, team, aliceMember]);
        const blockedCreate = createHumanAssignment(service.url, { ...base, actorUserId: owner!, title: "After removal" });
        await transition.query("COMMIT");
        await expect(blockedCreate).rejects.toBeInstanceOf(HumanWorkDenied);
      } finally { await transition.end(); }
      await admin.query(`UPDATE public.team_memberships SET ended_at=NULL
        WHERE organization_id=$1 AND team_id=$2 AND membership_id=$3`, [org.organizationId, team, aliceMember]);
      await admin.query("UPDATE public.teams SET status='archived' WHERE organization_id=$1 AND id=$2", [org.organizationId, team]);
      await expect(createHumanAssignment(service.url, { ...base, actorUserId: owner!, title: "Archived team" }))
        .rejects.toBeInstanceOf(HumanWorkDenied);
      await admin.query("UPDATE public.teams SET status='active' WHERE organization_id=$1 AND id=$2", [org.organizationId, team]);

      const pending = await createHumanAssignment(service.url, { ...base, actorUserId: manager!, evidenceRequired: false,
        title: "Pending follow up" });
      await admin.query("UPDATE public.memberships SET status='suspended' WHERE id=$1", [aliceMember]);
      await expect(listHumanAssignments(app.url, { actorUserId: alice!, organizationId: org.organizationId, scope: "own" }))
        .rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(completeHumanAssignment(service.url, { actorUserId: alice!, organizationId: org.organizationId,
        assignmentId: pending.id, outcome: "Untrusted completion", evidence: null }))
        .rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(createHumanAssignment(service.url, { ...base, actorUserId: manager! })).rejects.toBeInstanceOf(HumanWorkDenied);
      await admin.query("UPDATE public.memberships SET status='active' WHERE id=$1", [aliceMember]);
      await admin.query(`DELETE FROM public.role_permissions WHERE organization_id=$1
        AND role_id=(SELECT role_id FROM public.memberships WHERE id=$2) AND permission_key='assignments.manage.team'`,
      [org.organizationId, managerMember]);
      await expect(createHumanAssignment(service.url, { ...base, actorUserId: manager! })).rejects.toBeInstanceOf(HumanWorkDenied);

      // Hold a committed-to-disable revision open while both INSERT statements
      // wait on its transaction lock. After the disable commits, their volatile
      // post-lock module check must see the new revision and deny both writes.
      const disabler = new Client({ connectionString: service.url });
      await disabler.connect();
      await disabler.query("BEGIN");
      await disabler.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
        [owner, org.organizationId]);
      await disabler.query(`INSERT INTO public.workspace_module_revisions
        (organization_id,module_key,revision,enabled,actor_user_id) VALUES($1,'work',1,false,$2)`, [org.organizationId, owner]);
      const disableFirstCreate = createHumanAssignment(service.url, { ...base, actorUserId: owner!, teamId: null,
        assigneeMembershipId: bobMember, title: "After Work shutdown" });
      const disableFirstCompletion = completeHumanAssignment(service.url, { actorUserId: alice!,
        organizationId: org.organizationId, assignmentId: pending.id,
        outcome: "After Work shutdown", evidence: null });
      let waiters = 0;
      try {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const observed = await admin.query<{ waiting: number }>(`SELECT count(*)::int AS waiting
            FROM pg_stat_activity WHERE datname=current_database()
              AND wait_event_type='Lock' AND wait_event='advisory'
              AND (query LIKE 'INSERT INTO public.human_assignments%'
                OR query LIKE 'INSERT INTO public.human_assignment_completions%')`);
          waiters = observed.rows[0]?.waiting ?? 0;
          if (waiters >= 2) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } finally { await disabler.query("COMMIT"); await disabler.end(); }
      expect(waiters).toBeGreaterThanOrEqual(2);
      const blockedByDisable = await Promise.allSettled([disableFirstCreate, disableFirstCompletion]);
      expect(blockedByDisable.every(result => result.status === "rejected" && result.reason instanceof HumanWorkDenied)).toBe(true);
      await expect(listHumanAssignments(app.url, { actorUserId: alice!, organizationId: org.organizationId, scope: "own" })).rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(listAssignableMembers(service.url, { actorUserId: manager!, organizationId: org.organizationId, teamId: null })).rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(createHumanAssignment(service.url, { ...base, actorUserId: manager! })).rejects.toBeInstanceOf(HumanWorkDenied);
      await expect(completeHumanAssignment(service.url, { actorUserId: bob!, organizationId: org.organizationId,
        assignmentId: unteamed.id, outcome: "Done", evidence: null })).rejects.toBeInstanceOf(HumanWorkDenied);
    } finally {
      await cleanupImmutable(admin, "human_assignment_completions", "human_completion_immutable", organizations);
      await cleanupImmutable(admin, "human_assignments", "human_assignment_immutable", organizations);
      await cleanupImmutable(admin, "workspace_module_revisions", "workspace_module_immutable", organizations);
      await admin.query("DELETE FROM public.identity_audit_events WHERE organization_id=ANY($1)", [organizations]);
      await admin.query("DELETE FROM public.team_memberships WHERE organization_id=$1", [org.organizationId]);
      await admin.query("DELETE FROM public.teams WHERE organization_id=$1", [org.organizationId]);
      await admin.query("DELETE FROM public.role_permissions WHERE organization_id=ANY($1)", [organizations]);
      await admin.query("DELETE FROM public.memberships WHERE organization_id=ANY($1)", [organizations]);
      await admin.query("DELETE FROM public.roles WHERE organization_id=ANY($1)", [organizations]);
      await admin.query("DELETE FROM public.organizations WHERE id=ANY($1)", [organizations]);
      await admin.query("DELETE FROM public.users WHERE id=ANY($1)", [identities]);
      for (const login of logins) {
        await admin.query(`REVOKE ${login.grant} FROM ${login.name}`);
        await admin.query(`DROP ROLE ${login.name}`);
      }
      await admin.end();
    }
  });
});

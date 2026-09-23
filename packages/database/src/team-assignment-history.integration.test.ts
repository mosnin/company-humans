import { createCanonicalId } from "@company-human/contracts";
import { Client } from "pg";
import { expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

it.skipIf(!databaseUrl)("records team assignment intervals, gaps, roles and tenant provenance without writable history", async () => {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  await db.query("BEGIN");
  try {
    const owner = createCanonicalId("user");
    const org = createCanonicalId("organization");
    const foreign = createCanonicalId("organization");
    const member = createCanonicalId("membership");
    const foreignMember = createCanonicalId("membership");
    const team = createCanonicalId("team");
    const foreignTeam = createCanonicalId("team");
    await db.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://team-history.test',$1,'History owner','active',1)", [owner]);
    for (const organizationId of [org, foreign]) {
      await db.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,$2,'History org',$3)",
        [organizationId, organizationId.replaceAll("_", "-"), owner]);
      const role = createCanonicalId("role");
      await db.query("INSERT INTO roles(id,organization_id,key) VALUES($1,$2,'owner')", [role, organizationId]);
    }
    await db.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,'owner','active')", [member, org, owner]);
    await db.query("INSERT INTO memberships(id,organization_id,user_id,role_key,status) VALUES($1,$2,$3,'owner','active')", [foreignMember, foreign, owner]);
    await db.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) SELECT $1,id,'teams.manage.all' FROM roles WHERE organization_id=$1 AND key='owner'", [org]);
    await db.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,'History team')", [team, org]);
    await db.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,'Foreign team')", [foreignTeam, foreign]);

    const active = async () => (await db.query<{ started_at: Date; team_role: string; start_origin: string }>(
      "SELECT started_at,team_role,start_origin FROM company_human_private.team_assignment_active WHERE team_id=$1 AND membership_id=$2", [team, member])).rows;
    const history = async () => (await db.query<{ started_at: Date; ended_at: Date; team_role: string; end_reason: string; organization_id: string; start_origin: string }>(
      "SELECT organization_id,team_role,started_at,ended_at,start_origin,end_reason FROM company_human_private.team_assignment_history WHERE team_id=$1 AND membership_id=$2 ORDER BY started_at", [team, member])).rows;

    await db.query("INSERT INTO team_memberships(organization_id,team_id,membership_id,team_role) VALUES($1,$2,$3,'member')", [org, team, member]);
    const firstStart = (await active())[0]!.started_at;
    expect((await active())[0]).toMatchObject({ team_role: "member", start_origin: "insert" });
    await db.query("SELECT pg_sleep(0.005)");
    await db.query("UPDATE team_memberships SET team_role='manager' WHERE team_id=$1 AND membership_id=$2", [team, member]);
    expect(await history()).toMatchObject([{ organization_id: org, team_role: "member", end_reason: "role_change", start_origin: "insert" }]);
    expect((await active())[0]).toMatchObject({ team_role: "manager", start_origin: "role_change" });
    await db.query("SELECT pg_sleep(0.005)");
    await db.query("UPDATE team_memberships SET ended_at=now() WHERE team_id=$1 AND membership_id=$2", [team, member]);
    const closed = await history();
    expect(closed).toHaveLength(2);
    expect(closed[1]).toMatchObject({ organization_id: org, team_role: "manager", end_reason: "removed" });
    expect(closed[0]!.started_at.getTime()).toBe(firstStart.getTime());
    expect(closed[0]!.ended_at.getTime()).toBe(closed[1]!.started_at.getTime());
    expect(await active()).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await db.query("INSERT INTO team_memberships(organization_id,team_id,membership_id,team_role) VALUES($1,$2,$3,'member') ON CONFLICT(team_id,membership_id) DO UPDATE SET team_role=EXCLUDED.team_role,ended_at=NULL", [org, team, member]);
    const reopened = (await active())[0]!;
    expect(reopened).toMatchObject({ team_role: "member", start_origin: "reactivation" });
    expect(reopened.started_at.getTime()).toBeGreaterThan(closed[1]!.ended_at.getTime());
    const gap = new Date((reopened.started_at.getTime() + closed[1]!.ended_at.getTime()) / 2);
    const at = async (atTime: Date) => (await db.query(
      `SELECT team_role FROM company_human_private.team_assignment_history
       WHERE organization_id=$1 AND team_id=$2 AND membership_id=$3 AND started_at <= $4 AND ended_at > $4
       UNION ALL SELECT team_role FROM company_human_private.team_assignment_active
       WHERE organization_id=$1 AND team_id=$2 AND membership_id=$3 AND started_at <= $4`,
      [org, team, member, atTime])).rows;
    const closedMidpoint = await db.query<{ team_role: string }>(
      `WITH sample AS (
         SELECT started_at + (ended_at - started_at)/2 AS at_time
         FROM company_human_private.team_assignment_history
         WHERE team_id=$1 AND membership_id=$2 ORDER BY started_at LIMIT 1
       ) SELECT h.team_role FROM company_human_private.team_assignment_history h CROSS JOIN sample s
       WHERE h.organization_id=$3 AND h.team_id=$1 AND h.membership_id=$2
         AND h.started_at <= s.at_time AND h.ended_at > s.at_time`,
      [team, member, org]);
    expect(closedMidpoint.rows).toMatchObject([{ team_role: "member" }]);
    expect(await at(gap)).toEqual([]);
    expect(await at(new Date(reopened.started_at.getTime() + 1))).toMatchObject([{ team_role: "member" }]);

    await db.query("SAVEPOINT rollback_role_change");
    await db.query("UPDATE team_memberships SET team_role='manager' WHERE team_id=$1 AND membership_id=$2", [team, member]);
    expect(await history()).toHaveLength(3);
    await db.query("ROLLBACK TO SAVEPOINT rollback_role_change");
    expect(await history()).toHaveLength(2);
    expect((await active())[0]).toMatchObject({ team_role: "member", start_origin: "reactivation" });
    await db.query("SAVEPOINT rapid_role_changes");
    await db.query("UPDATE team_memberships SET team_role='manager' WHERE team_id=$1 AND membership_id=$2", [team, member]);
    await db.query("UPDATE team_memberships SET team_role='member' WHERE team_id=$1 AND membership_id=$2", [team, member]);
    const rapidIntervals = await history();
    expect(rapidIntervals).toHaveLength(4);
    const validIntervals = await db.query<{ valid: boolean }>(
      "SELECT bool_and(ended_at > started_at) AS valid FROM company_human_private.team_assignment_history WHERE team_id=$1 AND membership_id=$2",
      [team, member]);
    expect(validIntervals.rows[0]!.valid).toBe(true);
    await db.query("ROLLBACK TO SAVEPOINT rapid_role_changes");
    expect(await history()).toHaveLength(2);

    const expectActiveAfterLatestClosed = async () => {
      const result = await db.query<{ separated: boolean }>(
        `SELECT a.started_at > (SELECT max(h.ended_at) FROM company_human_private.team_assignment_history h
           WHERE h.team_id=a.team_id AND h.membership_id=a.membership_id) AS separated
         FROM company_human_private.team_assignment_active a WHERE a.team_id=$1 AND a.membership_id=$2`,
        [team, member]);
      expect(result.rows[0]?.separated).toBe(true);
    };
    await db.query("SAVEPOINT immediate_reactivation");
    await db.query("UPDATE team_memberships SET ended_at=now() WHERE team_id=$1 AND membership_id=$2", [team, member]);
    await db.query("UPDATE team_memberships SET ended_at=NULL WHERE team_id=$1 AND membership_id=$2", [team, member]);
    await expectActiveAfterLatestClosed();
    await db.query("ROLLBACK TO SAVEPOINT immediate_reactivation");
    await db.query("SAVEPOINT immediate_reinsert");
    await db.query("DELETE FROM team_memberships WHERE team_id=$1 AND membership_id=$2", [team, member]);
    await db.query("INSERT INTO team_memberships(organization_id,team_id,membership_id,team_role) VALUES($1,$2,$3,'member')", [org, team, member]);
    await expectActiveAfterLatestClosed();
    await db.query("ROLLBACK TO SAVEPOINT immediate_reinsert");

    await db.query("SAVEPOINT restricted_service_transition");
    await db.query("SET LOCAL ROLE company_human_service");
    await db.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [owner, org]);
    expect((await db.query("UPDATE team_memberships SET team_role='manager' WHERE team_id=$1 AND membership_id=$2", [team, member])).rowCount).toBe(1);
    await db.query("ROLLBACK TO SAVEPOINT restricted_service_transition");
    expect(await history()).toHaveLength(2);
    expect((await active())[0]!.team_role).toBe("member");

    await db.query("SAVEPOINT foreign_assignment");
    await expect(db.query("INSERT INTO team_memberships(organization_id,team_id,membership_id,team_role) VALUES($1,$2,$3,'member')", [foreign, foreignTeam, member])).rejects.toThrow();
    await db.query("ROLLBACK TO SAVEPOINT foreign_assignment");
    expect((await db.query("SELECT count(*)::int AS count FROM company_human_private.team_assignment_active WHERE organization_id=$1", [foreign])).rows[0]!.count).toBe(0);

    await db.query("SAVEPOINT restricted_history");
    await db.query("SET LOCAL ROLE company_human_service");
    await expect(db.query("SELECT * FROM company_human_private.team_assignment_history LIMIT 1")).rejects.toThrow();
    await db.query("ROLLBACK TO SAVEPOINT restricted_history");
    await db.query("SAVEPOINT restricted_history_write");
    await db.query("SET LOCAL ROLE company_human_service");
    await expect(db.query("UPDATE company_human_private.team_assignment_history SET team_role='manager' WHERE team_id=$1", [team])).rejects.toThrow();
    await db.query("ROLLBACK TO SAVEPOINT restricted_history_write");
    await db.query("SAVEPOINT restricted_active_write");
    await db.query("SET LOCAL ROLE company_human_service");
    await expect(db.query("DELETE FROM company_human_private.team_assignment_active WHERE team_id=$1", [team])).rejects.toThrow();
    await db.query("ROLLBACK TO SAVEPOINT restricted_active_write");
    await db.query("SAVEPOINT restricted_forgery");
    await db.query("SET LOCAL ROLE company_human_service");
    await expect(db.query("INSERT INTO company_human_private.team_assignment_history(organization_id,team_id,membership_id,team_role,started_at,ended_at,start_origin,end_reason) VALUES($1,$2,$3,'member',now()-interval '1 day',now(),'insert','removed')", [foreign, team, member])).rejects.toThrow();
    await db.query("ROLLBACK TO SAVEPOINT restricted_forgery");
    await db.query("SAVEPOINT restricted_active_forgery");
    await db.query("SET LOCAL ROLE company_human_service");
    await expect(db.query("INSERT INTO company_human_private.team_assignment_active(organization_id,team_id,membership_id,team_role,started_at,start_origin) VALUES($1,$2,$3,'member',now(),'insert')", [foreign, foreignTeam, member])).rejects.toThrow();
    await db.query("ROLLBACK TO SAVEPOINT restricted_active_forgery");

    await db.query("DELETE FROM team_memberships WHERE team_id=$1 AND membership_id=$2", [team, member]);
    expect((await history()).at(-1)).toMatchObject({ end_reason: "deleted", start_origin: "reactivation" });
    expect(await active()).toEqual([]);
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});

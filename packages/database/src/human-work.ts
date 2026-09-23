import { Client } from "pg";
import { z } from "zod";
import {
  createCanonicalId, HumanAssignmentIdSchema, HumanCompletionIdSchema,
  MembershipIdSchema, OrganizationIdSchema, TeamIdSchema, UserIdSchema,
  type HumanAssignmentId,
} from "@company-human/contracts";
import { setServiceContext } from "./service-context.js";

const Context = z.object({ actorUserId: UserIdSchema, organizationId: OrganizationIdSchema }).strict();
const DateTime = z.string().datetime({ offset: true });
const Create = Context.extend({
  assigneeMembershipId: MembershipIdSchema,
  teamId: TeamIdSchema.nullable(),
  title: z.string().trim().min(1).max(160),
  objective: z.string().trim().min(1).max(2000),
  dueAt: DateTime.nullable(),
  priority: z.enum(["low", "normal", "high"]),
  expectedOutcome: z.string().trim().min(1).max(2000),
  evidenceRequired: z.boolean(),
}).strict();
const List = Context.extend({
  scope: z.enum(["own", "team", "all"]),
  offset: z.number().int().nonnegative().max(1000000).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
}).strict();
const Complete = Context.extend({
  assignmentId: HumanAssignmentIdSchema,
  outcome: z.string().trim().min(1).max(2000),
  evidence: z.string().trim().min(1).max(4000).nullable(),
}).strict();
const Assignable = Context.extend({ teamId: TeamIdSchema.nullable() }).strict();

export class HumanWorkDenied extends Error {
  constructor() { super("Human Work unavailable or permission denied"); this.name = "HumanWorkDenied"; }
}
export class HumanWorkConflict extends Error {
  constructor() { super("This assignment has already been reported complete"); this.name = "HumanWorkConflict"; }
}

export interface HumanAssignment {
  id: HumanAssignmentId;
  organizationId: string;
  assigneeMembershipId: string;
  assigneeDisplayName: string;
  teamId: string | null;
  title: string;
  objective: string;
  dueAt: string | null;
  priority: "low" | "normal" | "high";
  source: "manager";
  expectedOutcome: string;
  evidenceRequired: boolean;
  createdAt: string;
  completion: null | {
    id: string;
    outcome: string;
    evidence: string | null;
    reportedAt: string;
  };
}
export interface AssignableHumanMember {
  membershipId: string;
  displayName: string;
  teamId: string | null;
  teamName: string | null;
}
export interface HumanAssignmentPage {
  items: HumanAssignment[];
  /** Null means no more assignments were visible when this page was read. */
  nextOffset: number | null;
}

type AssignmentRow = {
  id: string; organization_id: string; assignee_membership_id: string;
  assignee_display_name: string; team_id: string | null; title: string; objective: string;
  due_at: Date | null; priority: HumanAssignment["priority"]; source: "manager";
  expected_outcome: string; evidence_required: boolean; created_at: Date;
  completion_id: string | null; completion_outcome: string | null;
  completion_evidence: string | null; completion_reported_at: Date | null;
};
function assignmentSelect(withAssigneeName: boolean) { return `SELECT a.id,a.organization_id,a.assignee_membership_id,
  ${withAssigneeName ? "COALESCE(NULLIF(trim(u.display_name),''),'Member')" : "'You'"} AS assignee_display_name,
  a.team_id,a.title,a.objective,a.due_at,a.priority,a.source,a.expected_outcome,
  a.evidence_required,a.created_at,c.id AS completion_id,c.outcome AS completion_outcome,
  c.evidence AS completion_evidence,c.reported_at AS completion_reported_at
  FROM public.human_assignments a
  ${withAssigneeName ? `JOIN public.memberships m ON m.organization_id=a.organization_id AND m.id=a.assignee_membership_id
  JOIN public.users u ON u.id=m.user_id` : ""}
  LEFT JOIN public.human_assignment_completions c ON c.organization_id=a.organization_id AND c.assignment_id=a.id`; }
function assignmentFromRow(row: AssignmentRow): HumanAssignment {
  return {
    id: HumanAssignmentIdSchema.parse(row.id), organizationId: row.organization_id,
    assigneeMembershipId: row.assignee_membership_id, assigneeDisplayName: row.assignee_display_name,
    teamId: row.team_id, title: row.title, objective: row.objective,
    dueAt: row.due_at?.toISOString() ?? null, priority: row.priority, source: row.source,
    expectedOutcome: row.expected_outcome, evidenceRequired: row.evidence_required,
    createdAt: row.created_at.toISOString(),
    completion: row.completion_id && row.completion_outcome && row.completion_reported_at
      ? { id: HumanCompletionIdSchema.parse(row.completion_id), outcome: row.completion_outcome,
        evidence: row.completion_evidence, reportedAt: row.completion_reported_at.toISOString() }
      : null,
  };
}

function pgCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code : null;
}
function mapWorkError(error: unknown): never {
  if (pgCode(error) === "23505") throw new HumanWorkConflict();
  if (pgCode(error) === "42501" || pgCode(error) === "23503") throw new HumanWorkDenied();
  throw error;
}
async function requireRestrictedRole(client: Client, roleName: "company_human_app" | "company_human_service") {
  const role = await client.query<{ allowed: boolean }>(`SELECT pg_has_role(current_user,$1,'member')
    AND NOT r.rolsuper AND NOT r.rolbypassrls
    AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class
      WHERE oid='public.human_assignments'::regclass),'member') AS allowed
    FROM pg_roles r WHERE r.rolname=current_user`, [roleName]);
  if (!role.rows[0]?.allowed) throw new HumanWorkDenied();
}

/** All reads are scoped in RLS and checked again for the requested view. */
export async function listHumanAssignments(databaseUrl: string, input: z.input<typeof List>): Promise<HumanAssignmentPage> {
  const parsed = List.parse(input);
  const offset = parsed.offset ?? 0;
  const pageSize = parsed.pageSize ?? 50;
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await requireRestrictedRole(client, parsed.scope === "own" ? "company_human_app" : "company_human_service");
    await client.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
      [parsed.actorUserId, parsed.organizationId]);
    const key = parsed.scope === "own" ? "assignments.read.own"
      : parsed.scope === "team" ? "assignments.read.team" : "assignments.read.all";
    const check = await client.query<{ allowed: boolean }>(`SELECT company_human_private.work_module_enabled($1)
      AND company_human_private.has_capability($1,$2) AS allowed`, [parsed.organizationId, key]);
    if (!check.rows[0]?.allowed) throw new HumanWorkDenied();
    const filter = parsed.scope === "own" ? `AND EXISTS(SELECT 1 FROM public.memberships self
      WHERE self.organization_id=a.organization_id AND self.id=a.assignee_membership_id
        AND self.user_id=$2 AND self.status='active')`
      : parsed.scope === "team" ? `AND a.team_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM public.team_memberships tm JOIN public.memberships manager
          ON manager.organization_id=tm.organization_id AND manager.id=tm.membership_id
        WHERE tm.organization_id=a.organization_id AND tm.team_id=a.team_id
          AND tm.team_role='manager' AND tm.ended_at IS NULL
          AND manager.status='active' AND manager.user_id=$2)` : "";
    const result = await client.query<AssignmentRow>(`${assignmentSelect(parsed.scope !== "own")}
      WHERE a.organization_id=$1 AND $2::text IS NOT NULL ${filter}
      ORDER BY c.id IS NOT NULL,a.due_at ASC NULLS LAST,a.created_at DESC,a.id
      LIMIT $3 OFFSET $4`,
    [parsed.organizationId, parsed.actorUserId, pageSize + 1, offset]);
    await client.query("COMMIT");
    return { items: result.rows.slice(0, pageSize).map(assignmentFromRow),
      nextOffset: result.rows.length > pageSize ? offset + pageSize : null };
  } catch (error) {
    await client.query("ROLLBACK");
    mapWorkError(error);
  } finally { await client.end(); }
}

/** Returns one member/team pairing the actor may assign, plus an unteamed
 * choice for organization-wide managers. A null team filter discovers all
 * authorized teams for a team manager. */
export async function listAssignableMembers(databaseUrl: string, input: z.input<typeof Assignable>): Promise<AssignableHumanMember[]> {
  const parsed = Assignable.parse(input);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await requireRestrictedRole(client, "company_human_service");
    await client.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
      [parsed.actorUserId, parsed.organizationId]);
    const check = await client.query<{ allowed: boolean }>(`SELECT company_human_private.work_module_enabled($1)
      AND (company_human_private.has_capability($1,'assignments.manage.all')
        OR (company_human_private.has_capability($1,'assignments.manage.team')
          AND EXISTS(SELECT 1 FROM public.team_memberships tm
            JOIN public.memberships actor ON actor.organization_id=tm.organization_id AND actor.id=tm.membership_id
            JOIN public.teams t ON t.organization_id=tm.organization_id AND t.id=tm.team_id
            WHERE tm.organization_id=$1 AND ($2::text IS NULL OR tm.team_id=$2)
              AND tm.team_role='manager' AND tm.ended_at IS NULL
              AND actor.user_id=$3 AND actor.status='active' AND t.status='active')))
      AS allowed`, [parsed.organizationId, parsed.teamId, parsed.actorUserId]);
    if (!check.rows[0]?.allowed) throw new HumanWorkDenied();
    const result = await client.query<{ membership_id: string; display_name: string; team_id: string | null; team_name: string | null }>(
      `WITH authority AS (SELECT company_human_private.has_capability($1,'assignments.manage.all') AS manage_all,
        company_human_private.has_capability($1,'assignments.manage.team') AS manage_team)
       SELECT m.id AS membership_id,COALESCE(NULLIF(trim(u.display_name),''),'Member') AS display_name,
         choice.team_id,choice.team_name
       FROM public.memberships m JOIN public.users u ON u.id=m.user_id CROSS JOIN authority auth
       JOIN LATERAL (
         SELECT tm.team_id,t.name AS team_name FROM public.team_memberships tm
         JOIN public.teams t ON t.organization_id=tm.organization_id AND t.id=tm.team_id AND t.status='active'
         WHERE tm.organization_id=m.organization_id AND tm.membership_id=m.id AND tm.ended_at IS NULL
           AND ($2::text IS NULL OR tm.team_id=$2)
           AND (auth.manage_all OR (auth.manage_team AND EXISTS(
             SELECT 1 FROM public.team_memberships managed
             JOIN public.memberships actor ON actor.organization_id=managed.organization_id
               AND actor.id=managed.membership_id
             WHERE managed.organization_id=tm.organization_id AND managed.team_id=tm.team_id
               AND managed.team_role='manager' AND managed.ended_at IS NULL
               AND actor.user_id=$3 AND actor.status='active')))
         UNION ALL SELECT NULL::text,NULL::text WHERE auth.manage_all AND $2::text IS NULL
       ) choice ON TRUE
       WHERE m.organization_id=$1 AND m.status='active' AND u.status='active'
       ORDER BY display_name,m.id,team_name NULLS FIRST`, [parsed.organizationId, parsed.teamId, parsed.actorUserId]);
    await client.query("COMMIT");
    return result.rows.map(row => ({ membershipId: row.membership_id, displayName: row.display_name,
      teamId: row.team_id, teamName: row.team_name }));
  } catch (error) {
    await client.query("ROLLBACK");
    mapWorkError(error);
  } finally { await client.end(); }
}

export async function createHumanAssignment(databaseUrl: string, input: z.input<typeof Create>): Promise<HumanAssignment> {
  const parsed = Create.parse(input);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await requireRestrictedRole(client, "company_human_service");
    await setServiceContext(client, parsed.actorUserId, parsed.organizationId);
    const actor = await client.query<{ id: string }>(`SELECT id FROM public.memberships
      WHERE organization_id=$1 AND user_id=$2 AND status='active'`, [parsed.organizationId, parsed.actorUserId]);
    if (!actor.rows[0]) throw new HumanWorkDenied();
    const id = createCanonicalId("humanAssignment");
    await client.query(`INSERT INTO public.human_assignments
      (id,organization_id,assignee_membership_id,team_id,created_by_user_id,created_by_membership_id,
        title,objective,due_at,priority,expected_outcome,evidence_required)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, parsed.organizationId, parsed.assigneeMembershipId, parsed.teamId, parsed.actorUserId, actor.rows[0].id,
      parsed.title, parsed.objective, parsed.dueAt, parsed.priority, parsed.expectedOutcome, parsed.evidenceRequired]);
    const result = await client.query<AssignmentRow>(`${assignmentSelect(true)} WHERE a.organization_id=$1 AND a.id=$2`,
      [parsed.organizationId, id]);
    if (!result.rows[0]) throw new HumanWorkDenied();
    await client.query("COMMIT");
    return assignmentFromRow(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    mapWorkError(error);
  } finally { await client.end(); }
}

/** One irreversible contributor report. This records a claim, not verification. */
export async function completeHumanAssignment(databaseUrl: string, input: z.input<typeof Complete>): Promise<HumanAssignment> {
  const parsed = Complete.parse(input);
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await requireRestrictedRole(client, "company_human_service");
    await setServiceContext(client, parsed.actorUserId, parsed.organizationId);
    const actor = await client.query<{ id: string }>(`SELECT id FROM public.memberships
      WHERE organization_id=$1 AND user_id=$2 AND status='active'`, [parsed.organizationId, parsed.actorUserId]);
    if (!actor.rows[0]) throw new HumanWorkDenied();
    await client.query(`INSERT INTO public.human_assignment_completions
      (id,organization_id,assignment_id,actor_user_id,actor_membership_id,outcome,evidence)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [createCanonicalId("humanCompletion"), parsed.organizationId, parsed.assignmentId,
      parsed.actorUserId, actor.rows[0].id, parsed.outcome, parsed.evidence]);
    const result = await client.query<AssignmentRow>(`${assignmentSelect(true)} WHERE a.organization_id=$1 AND a.id=$2`,
      [parsed.organizationId, parsed.assignmentId]);
    if (!result.rows[0]) throw new HumanWorkDenied();
    await client.query("COMMIT");
    return assignmentFromRow(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    mapWorkError(error);
  } finally { await client.end(); }
}

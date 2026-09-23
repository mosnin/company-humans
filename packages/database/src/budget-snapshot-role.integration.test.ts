import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createCanonicalId } from "@company-human/contracts";
import { syncAuthUser } from "./auth-users.js";
import { createOrganization } from "./organizations.js";

const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.COMPANY_HUMAN_BUDGET_SNAPSHOT_TEST === "1";
const snapshotRole = "company_human_budget_snapshot";

async function readSnapshot<T>(
  actorUserId: string,
  organizationId: string,
  query: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query(`SET LOCAL ROLE ${snapshotRole}`);
    await client.query(
      "SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
      [actorUserId, organizationId],
    );
    const result = await query(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function expectSnapshotDenied(sql: string, args: unknown[], actorUserId: string, organizationId: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${snapshotRole}`);
    await client.query(
      "SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
      [actorUserId, organizationId],
    );
    await expect(client.query(sql, args)).rejects.toThrow(/permission denied|must be owner|cannot execute/i);
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}

describe.skipIf(!databaseUrl || !enabled)("budget snapshot database role", () => {
  it("reads a complete own-tenant snapshot and denies foreign, private, revoked, and write access", async () => {
    // syncAuthUser/createOrganization commit through independent connections;
    // this fixture is safe only in the disposable local 0072 database.
    const target = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
      !target.pathname.slice(1).startsWith("company_human_0072_")) {
      throw new Error("Budget snapshot fixture requires a disposable loopback company_human_0072_ database");
    }
    const suffix = randomBytes(6).toString("hex");
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();

    const owner = await syncAuthUser(databaseUrl!, {
      authIssuer: "https://identity.example.test",
      authSubject: `snapshot-owner-${suffix}`,
      primaryEmail: null,
      displayName: "Snapshot Owner",
      status: "active",
      eventTimestamp: 1,
    });
    const foreignOwner = await syncAuthUser(databaseUrl!, {
      authIssuer: "https://identity.example.test",
      authSubject: `snapshot-foreign-${suffix}`,
      primaryEmail: null,
      displayName: "Foreign Owner",
      status: "active",
      eventTimestamp: 1,
    });
    const organization = await createOrganization(databaseUrl!, {
      ownerUserId: owner,
      slug: `snapshot-${suffix}`,
      name: "Snapshot Organization",
    });
    const foreignOrganization = await createOrganization(databaseUrl!, {
      ownerUserId: foreignOwner,
      slug: `snapshot-foreign-${suffix}`,
      name: "Foreign Snapshot Organization",
    });

    const product = createCanonicalId("product");
    const foreignProduct = createCanonicalId("product");
    const instance = createCanonicalId("productInstance");
    const foreignInstance = createCanonicalId("productInstance");
    const team = createCanonicalId("team");
    const foreignTeam = createCanonicalId("team");
    const productMembership = createCanonicalId("productMembership");
    const foreignProductMembership = createCanonicalId("productMembership");
    const policy = createCanonicalId("budget");
    const teamPolicy = createCanonicalId("budget");
    const foreignPolicy = createCanonicalId("budget");
    const acceptedEvent = createCanonicalId("event");
    const releasedEvent = createCanonicalId("event");
    const hiddenEvent = createCanonicalId("event");
    const foreignEvent = createCanonicalId("event");
    const metadata = {
      schemaVersion: 1,
      description: "Budget snapshot fixture",
      category: "testing",
      supportedCapabilities: ["reports"],
      provisioningModes: ["connected"],
      supportedMemberOperations: ["provision", "suspend"],
      usageMeters: ["events"],
      requiredPermissions: ["product.use"],
      adapterVersion: "1.0.0",
      billingBehavior: "organization_sponsored",
      deepLinks: {},
      connectionRequirements: ["service-credential"],
    };

    let setupCommitted = false;
    try {
      await admin.query("BEGIN");
      await admin.query(
        `INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata)
         VALUES($1,$2,'Snapshot Product','ready',$3),
               ($4,$5,'Foreign Snapshot Product','ready',$3)`,
        [product, `snapshot-${suffix}`, metadata, foreignProduct, `snapshot-foreign-${suffix}`],
      );
      await admin.query(
        `INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name)
         VALUES($1,'events',1,'event','sum','Events'),
               ($2,'events',1,'event','sum','Foreign Events')`,
        [product, foreignProduct],
      );
      await admin.query(
        `INSERT INTO product_instances
          (id,organization_id,product_id,instance_key,mode,desired_enabled,provisioning_status,created_by_user_id)
         VALUES($1,$2,$3,'primary','connected',true,'active',$4),
               ($5,$6,$7,'primary','connected',true,'active',$8)`,
        [instance, organization.organizationId, product, owner,
          foreignInstance, foreignOrganization.organizationId, foreignProduct, foreignOwner],
      );
      await admin.query(
        `INSERT INTO teams(id,organization_id,name,status)
         VALUES($1,$2,'Snapshot Team','active'),($3,$4,'Foreign Team','active')`,
        [team, organization.organizationId, foreignTeam, foreignOrganization.organizationId],
      );
      await admin.query(
        `INSERT INTO team_memberships(organization_id,team_id,membership_id,team_role)
         VALUES($1,$2,$3,'member'),($4,$5,$6,'member')`,
        [organization.organizationId, team, organization.ownerMembershipId,
          foreignOrganization.organizationId, foreignTeam, foreignOrganization.ownerMembershipId],
      );
      await admin.query(
        `INSERT INTO product_memberships
          (id,organization_id,product_instance_id,membership_id,created_by_user_id)
         VALUES($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)`,
        [productMembership, organization.organizationId, instance, organization.ownerMembershipId, owner,
          foreignProductMembership, foreignOrganization.organizationId, foreignInstance,
          foreignOrganization.ownerMembershipId, foreignOwner],
      );

      const policySql = `INSERT INTO budget_policies
        (id,organization_id,product_id,meter_key,meter_version,unit,window_key,scope_kind,
         product_instance_id,team_id,membership_id,capability_key,created_by_user_id)
        VALUES($1,$2,$3,'events',1,'event','utc_day',$4,$5,$6,$7,$8,$9)`;
      const revisionSql = `INSERT INTO budget_policy_revisions
        (organization_id,budget_policy_id,revision,maximum_quantity,action,status,actor_user_id)
        VALUES($1,$2,$3,$4,$5,$6,$7)`;

      await admin.query("SET LOCAL ROLE company_human_service");
      await admin.query(
        "SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
        [owner, organization.organizationId],
      );
      await admin.query(policySql, [policy, organization.organizationId, product, "organization", null, null, null, null, owner]);
      await admin.query(revisionSql, [organization.organizationId, policy, 1, "10", "warning", "active", owner]);
      await admin.query(revisionSql, [organization.organizationId, policy, 2, "5", "warning", "disabled", owner]);
      await admin.query(policySql, [teamPolicy, organization.organizationId, product, "team", null, team, null, null, owner]);
      await admin.query(revisionSql, [organization.organizationId, teamPolicy, 1, "20", "hard_stop", "active", owner]);

      await admin.query("RESET ROLE");
      await admin.query("SET LOCAL ROLE company_human_service");
      await admin.query(
        "SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
        [foreignOwner, foreignOrganization.organizationId],
      );
      await admin.query(policySql, [foreignPolicy, foreignOrganization.organizationId, foreignProduct, "organization", null, null, null, null, foreignOwner]);
      await admin.query(revisionSql, [foreignOrganization.organizationId, foreignPolicy, 1, "30", "warning", "active", foreignOwner]);

      const insertEvent = async (
        eventId: string,
        organizationId: string,
        productId: string,
        productInstanceId: string,
        membershipId: string,
        disposition: "accepted" | "quarantined",
        capabilityKey: string | null,
        sourceEventId: string,
      ) => {
        await admin.query(
          `INSERT INTO usage_events
            (event_id,organization_id,product_id,product_instance_id,environment,source_system,source_event_id,
             idempotency_key,membership_id,team_id,meter_key,meter_version,quantity,unit,occurred_at,reported_at,
             disposition,envelope,signature)
           VALUES($1,$2,$3,$4,'production','snapshot-test',$5,$6,$7,NULL,'events',1,3,'event',now(),now(),$8,$9,$10)`,
          [eventId, organizationId, productId, productInstanceId, sourceEventId, `${sourceEventId}:idempotency`, membershipId,
            disposition, { actor: { type: "service", id: "snapshot-test" }, payload: capabilityKey === null ? {} : { capabilityKey } },
            { algorithm: "fixture" }],
        );
      };

      await admin.query("RESET ROLE");
      await admin.query("SET LOCAL ROLE company_human_usage_ingest");
      await admin.query(
        `SELECT set_config('company_human.organization_id',$1,true),
                set_config('company_human.product_instance_id',$2,true),
                set_config('company_human.integration_environment','production',true)`,
        [organization.organizationId, instance],
      );
      await insertEvent(acceptedEvent, organization.organizationId, product, instance, organization.ownerMembershipId, "accepted", "reports", `accepted-${suffix}`);
      await insertEvent(releasedEvent, organization.organizationId, product, instance, organization.ownerMembershipId, "quarantined", null, `released-${suffix}`);
      await insertEvent(hiddenEvent, organization.organizationId, product, instance, organization.ownerMembershipId, "quarantined", "reports", `hidden-${suffix}`);

      await admin.query("RESET ROLE");
      await admin.query("SET LOCAL ROLE company_human_usage_ingest");
      await admin.query(
        `SELECT set_config('company_human.organization_id',$1,true),
                set_config('company_human.product_instance_id',$2,true),
                set_config('company_human.integration_environment','production',true)`,
        [foreignOrganization.organizationId, foreignInstance],
      );
      await insertEvent(foreignEvent, foreignOrganization.organizationId, foreignProduct, foreignInstance, foreignOrganization.ownerMembershipId, "accepted", "reports", `foreign-${suffix}`);

      await admin.query("RESET ROLE");
      await admin.query("SET LOCAL ROLE company_human_usage_revalidator");
      await admin.query(
        "SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)",
        [owner, organization.organizationId],
      );
      await admin.query(
        `INSERT INTO usage_quarantine_releases
          (event_id,organization_id,membership_id,team_id,actor_user_id,reason)
         VALUES($1,$2,$3,NULL,$4,'released for snapshot fixture')`,
        [releasedEvent, organization.organizationId, organization.ownerMembershipId, owner],
      );
      await admin.query("RESET ROLE");
      await admin.query("COMMIT");
      setupCommitted = true;

      const roleProperties = await admin.query<{
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
      }>(
        `SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit
         FROM pg_roles WHERE rolname=$1`,
        [snapshotRole],
      );
      expect(roleProperties.rows).toEqual([{
        rolcanlogin: false,
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
      }]);
      expect((await admin.query(
        "SELECT count(*)::int AS count FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.roleid,m.member) WHERE r.rolname=$1",
        [snapshotRole],
      )).rows[0]!.count).toBe(0);
      const privilegeState = await admin.query<{
        public_create: boolean;
        private_create: boolean;
        policy_insert: boolean;
        policy_update: boolean;
        policy_delete: boolean;
        usage_insert: boolean;
        usage_update: boolean;
        usage_delete: boolean;
        capability_select: boolean;
        envelope_select: boolean;
        signature_select: boolean;
        provider_receipt_select: boolean;
      }>(
        `SELECT
          has_schema_privilege($1,'public','CREATE') AS public_create,
          has_schema_privilege($1,'company_human_private','CREATE') AS private_create,
          has_table_privilege($1,'public.budget_policies','INSERT') AS policy_insert,
          has_table_privilege($1,'public.budget_policies','UPDATE') AS policy_update,
          has_table_privilege($1,'public.budget_policies','DELETE') AS policy_delete,
          has_table_privilege($1,'public.usage_events','INSERT') AS usage_insert,
          has_table_privilege($1,'public.usage_events','UPDATE') AS usage_update,
          has_table_privilege($1,'public.usage_events','DELETE') AS usage_delete,
          has_column_privilege($1,'public.usage_events','capability_key','SELECT') AS capability_select,
          has_column_privilege($1,'public.usage_events','envelope','SELECT') AS envelope_select,
          has_column_privilege($1,'public.usage_events','signature','SELECT') AS signature_select,
          has_column_privilege($1,'public.product_memberships','provider_receipt_reference','SELECT') AS provider_receipt_select`,
        [snapshotRole],
      );
      expect(privilegeState.rows[0]).toEqual({
        public_create: false,
        private_create: false,
        policy_insert: false,
        policy_update: false,
        policy_delete: false,
        usage_insert: false,
        usage_update: false,
        usage_delete: false,
        capability_select: true,
        envelope_select: false,
        signature_select: false,
        provider_receipt_select: false,
      });

      const visible = await readSnapshot(owner, organization.organizationId, async (client) => {
        const policies = await client.query(
          `SELECT p.id,p.scope_kind,r.revision,r.maximum_quantity,r.action,r.status
           FROM budget_policies p
           JOIN budget_policy_revisions r
             ON r.organization_id=p.organization_id AND r.budget_policy_id=p.id
           WHERE p.product_id=$1 AND p.meter_key='events' AND p.meter_version=1 AND p.unit='event'
           ORDER BY p.scope_kind,p.id,r.revision`,
          [product],
        );
        const counts = await client.query<{ table_name: string; count: number }>(
          `SELECT 'instances' AS table_name,count(*)::int AS count FROM product_instances
           UNION ALL SELECT 'memberships',count(*)::int FROM memberships
           UNION ALL SELECT 'teams',count(*)::int FROM teams
           UNION ALL SELECT 'team_memberships',count(*)::int FROM team_memberships
           UNION ALL SELECT 'product_memberships',count(*)::int FROM product_memberships
           UNION ALL SELECT 'usage_releases',count(*)::int FROM usage_quarantine_releases`,
        );
        const usage = await client.query(
          `SELECT event_id,product_id,capability_key,disposition
           FROM usage_events WHERE product_id=$1 ORDER BY disposition,event_id`,
          [product],
        );
        const meter = await client.query(
          `SELECT product_id,meter_key,version,unit,aggregation
           FROM meter_definitions WHERE product_id=$1 AND meter_key='events' AND version=1 AND unit='event'`,
          [product],
        );
        const productContext = await client.query(
          `SELECT id,catalog_status,catalog_metadata,access_contract_revision
           FROM products WHERE id=$1`,
          [product],
        );
        return { policies: policies.rows, counts: counts.rows, usage: usage.rows, meter: meter.rows, productContext: productContext.rows };
      });
      expect(visible.policies).toEqual([
        { id: policy, scope_kind: "organization", revision: 1, maximum_quantity: "10", action: "warning", status: "active" },
        { id: policy, scope_kind: "organization", revision: 2, maximum_quantity: "5", action: "warning", status: "disabled" },
        { id: teamPolicy, scope_kind: "team", revision: 1, maximum_quantity: "20", action: "hard_stop", status: "active" },
      ]);
      expect(Object.fromEntries(visible.counts.map((row) => [row.table_name, row.count]))).toEqual({
        instances: 1,
        memberships: 1,
        teams: 1,
        team_memberships: 1,
        product_memberships: 1,
        usage_releases: 1,
      });
      expect(visible.usage).toEqual([
        { event_id: acceptedEvent, product_id: product, capability_key: "reports", disposition: "accepted" },
        { event_id: releasedEvent, product_id: product, capability_key: null, disposition: "quarantined" },
      ]);
      expect(visible.meter).toEqual([{ product_id: product, meter_key: "events", version: 1, unit: "event", aggregation: "sum" }]);
      expect(visible.productContext[0]?.catalog_status).toBe("ready");
      expect(visible.productContext[0]?.access_contract_revision).toBe("0");

      const foreignCounts = await readSnapshot(owner, organization.organizationId, async (client) => {
        const result = await client.query<{ policies: number; instances: number; usage: number }>(
          `SELECT
            (SELECT count(*)::int FROM budget_policies WHERE organization_id=$1) AS policies,
            (SELECT count(*)::int FROM product_instances WHERE organization_id=$1) AS instances,
            (SELECT count(*)::int FROM usage_events WHERE organization_id=$1) AS usage`,
          [foreignOrganization.organizationId],
        );
        return result.rows[0]!;
      });
      expect(foreignCounts).toEqual({ policies: 0, instances: 0, usage: 0 });

      const noTenantContext = await readSnapshot(owner, "", async (client) => {
        const result = await client.query<{ policies: number; usage: number }>(
          `SELECT
            (SELECT count(*)::int FROM budget_policies) AS policies,
            (SELECT count(*)::int FROM usage_events) AS usage`,
        );
        return result.rows[0]!;
      });
      expect(noTenantContext).toEqual({ policies: 0, usage: 0 });

      await expect(readSnapshot(owner, organization.organizationId, async (client) => {
        await client.query("SELECT envelope FROM usage_events WHERE event_id=$1", [acceptedEvent]);
        return undefined;
      })).rejects.toThrow(/permission denied/);

      const ownerRole = (await admin.query<{ role_id: string }>(
        "SELECT role_id FROM memberships WHERE id=$1",
        [organization.ownerMembershipId],
      )).rows[0]!.role_id;
      const revoke = async (permission: string, assertion: () => Promise<void>) => {
        const removed = await admin.query(
          `DELETE FROM role_permissions
           WHERE organization_id=$1 AND role_id=$2 AND permission_key=$3
           RETURNING permission_key`,
          [organization.organizationId, ownerRole, permission],
        );
        expect(removed.rows).toEqual([{ permission_key: permission }]);
        try {
          await assertion();
        } finally {
          await admin.query(
            "INSERT INTO role_permissions(organization_id,role_id,permission_key) VALUES($1,$2,$3)",
            [organization.organizationId, ownerRole, permission],
          );
        }
      };
      await revoke("usage.read.all", async () => {
        const denied = await readSnapshot(owner, organization.organizationId, async (client) => {
          const result = await client.query<{ policies: number; usage: number }>(
            `SELECT
              (SELECT count(*)::int FROM budget_policies) AS policies,
              (SELECT count(*)::int FROM usage_events) AS usage`,
          );
          return result.rows[0]!;
        });
        expect(denied).toEqual({ policies: 0, usage: 0 });
      });
      await revoke("budgets.manage", async () => {
        const denied = await readSnapshot(owner, organization.organizationId, async (client) => {
          const result = await client.query<{ policies: number; usage: number }>(
            `SELECT
              (SELECT count(*)::int FROM budget_policies) AS policies,
              (SELECT count(*)::int FROM usage_events) AS usage`,
          );
          return result.rows[0]!;
        });
        expect(denied).toEqual({ policies: 0, usage: 0 });
      });

      await expectSnapshotDenied(
        `INSERT INTO budget_policies
          (id,organization_id,product_id,meter_key,meter_version,unit,window_key,scope_kind,created_by_user_id)
         VALUES($1,$2,$3,'events',1,'event','utc_day','meter',$4)`,
        [createCanonicalId("budget"), organization.organizationId, product, owner], owner, organization.organizationId,
      );
      await expectSnapshotDenied(
        "UPDATE usage_events SET quantity=quantity WHERE event_id=$1",
        [acceptedEvent], owner, organization.organizationId,
      );
      await expectSnapshotDenied(
        "DELETE FROM usage_events WHERE event_id=$1",
        [acceptedEvent], owner, organization.organizationId,
      );
      await expectSnapshotDenied(
        `CREATE TABLE public.budget_snapshot_forbidden_${suffix}(id integer)`,
        [], owner, organization.organizationId,
      );
    } finally {
      await admin.query("ROLLBACK").catch(() => undefined);
      if (setupCommitted) {
        await admin.query("BEGIN");
        try {
          await admin.query("ALTER TABLE usage_quarantine_releases DISABLE TRIGGER immutable_usage_release");
          await admin.query("ALTER TABLE usage_events DISABLE TRIGGER immutable_usage");
          await admin.query("ALTER TABLE budget_policy_revisions DISABLE TRIGGER immutable_budget_policy_revision");
          await admin.query("ALTER TABLE budget_policies DISABLE TRIGGER immutable_budget_policy");
          await admin.query("ALTER TABLE meter_definitions DISABLE TRIGGER immutable_meter");
          await admin.query("DELETE FROM usage_quarantine_releases WHERE event_id=ANY($1)", [[acceptedEvent, releasedEvent, hiddenEvent, foreignEvent]]);
          await admin.query("DELETE FROM usage_events WHERE event_id=ANY($1)", [[acceptedEvent, releasedEvent, hiddenEvent, foreignEvent]]);
          await admin.query("DELETE FROM budget_policy_revisions WHERE budget_policy_id=ANY($1)", [[policy, teamPolicy, foreignPolicy]]);
          await admin.query("DELETE FROM budget_policies WHERE id=ANY($1)", [[policy, teamPolicy, foreignPolicy]]);
          await admin.query("DELETE FROM product_memberships WHERE id=ANY($1)", [[productMembership, foreignProductMembership]]);
          await admin.query("DELETE FROM team_memberships WHERE team_id=ANY($1)", [[team, foreignTeam]]);
          await admin.query("DELETE FROM teams WHERE id=ANY($1)", [[team, foreignTeam]]);
          await admin.query("DELETE FROM product_instances WHERE id=ANY($1)", [[instance, foreignInstance]]);
          await admin.query("DELETE FROM meter_definitions WHERE product_id=ANY($1)", [[product, foreignProduct]]);
          await admin.query("DELETE FROM products WHERE id=ANY($1)", [[product, foreignProduct]]);
          await admin.query("ALTER TABLE usage_quarantine_releases ENABLE TRIGGER immutable_usage_release");
          await admin.query("ALTER TABLE usage_events ENABLE TRIGGER immutable_usage");
          await admin.query("ALTER TABLE budget_policy_revisions ENABLE TRIGGER immutable_budget_policy_revision");
          await admin.query("ALTER TABLE budget_policies ENABLE TRIGGER immutable_budget_policy");
          await admin.query("ALTER TABLE meter_definitions ENABLE TRIGGER immutable_meter");
          await admin.query("COMMIT");
        } catch (error) {
          await admin.query("ROLLBACK");
          throw error;
        }
      }
      for (const table of ["identity_audit_events", "memberships", "roles"]) {
        await admin.query(`DELETE FROM ${table} WHERE organization_id=ANY($1)`, [[organization.organizationId, foreignOrganization.organizationId]]);
      }
      await admin.query("DELETE FROM organizations WHERE id=ANY($1)", [[organization.organizationId, foreignOrganization.organizationId]]);
      await admin.query("DELETE FROM users WHERE id=ANY($1)", [[owner, foreignOwner]]);
      await admin.end();
    }
  });
});

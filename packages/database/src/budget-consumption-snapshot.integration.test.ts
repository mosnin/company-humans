import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createCanonicalId, type BudgetOperationV1 } from "@company-human/contracts";
import {
  BudgetConsumptionSnapshotDeniedError,
  BudgetConsumptionSnapshotIncompleteError,
  readBudgetConsumptionSnapshot,
} from "./budget-consumption-snapshot.js";

const databaseUrl = process.env.DATABASE_URL;
const enabled = process.env.COMPANY_HUMAN_BUDGET_SNAPSHOT_TEST === "1";

describe.skipIf(!databaseUrl || !enabled)("read-only budget consumption snapshots", () => {
  it("evaluates complete overlapping scopes, exact zeroes, tenant denial, unknown attribution, and one stable read-only snapshot", async () => {
    const target = new URL(databaseUrl!);
    if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
        !target.pathname.slice(1).startsWith("company_human_0072_")) {
      throw new Error("Budget snapshot fixture requires a disposable loopback company_human_0072_ database");
    }
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    const suffix = randomBytes(6).toString("hex");
    const runtimeRole = `ch_snapshot_${suffix}`;
    const runtimePassword = randomBytes(20).toString("hex");
    const serviceRole = `ch_snapshot_service_${suffix}`;
    const servicePassword = randomBytes(20).toString("hex");
    const actor = createCanonicalId("user");
    const organization = createCanonicalId("organization");
    const otherOrganization = createCanonicalId("organization");
    const product = createCanonicalId("product");
    const instance = createCanonicalId("productInstance");
    const membership = createCanonicalId("membership");
    const team = createCanonicalId("team");
    const role = createCanonicalId("role");
    const meter = { meterKey: "compute", meterVersion: 1, unit: "unit" } as const;
    const metadata = {
      schemaVersion: 1, description: "Snapshot fixture", category: "test",
      supportedCapabilities: ["compute"], provisioningModes: ["connected"],
      supportedMemberOperations: ["provision"], usageMeters: ["compute", "peak", "state"],
      requiredPermissions: [], adapterVersion: "1", billingBehavior: "native",
      deepLinks: {}, connectionRequirements: [],
    };
    const operation: BudgetOperationV1 = {
      schemaVersion: 1, organizationId: organization, productId: product,
      productInstanceId: instance, membershipId: membership,
      operationTeam: { teamId: team, organizationId: organization, membershipId: membership },
      capabilityKey: "compute", meter,
    };
    const policyIds = [
      createCanonicalId("budget"), createCanonicalId("budget"), createCanonicalId("budget"),
      createCanonicalId("budget"), createCanonicalId("budget"), createCanonicalId("budget"),
      createCanonicalId("budget"),
    ];
    const runtime = new URL(databaseUrl!);
    runtime.username = runtimeRole;
    runtime.password = runtimePassword;
    const service = new URL(databaseUrl!);
    service.username = serviceRole;
    service.password = servicePassword;
    const insertUsage = async (client: Client, quantity: string, membershipId: string | null, teamId: string | null, capabilityKey: string | null) => {
      const eventId = createCanonicalId("event");
      const sourceId = `snapshot-${crypto.randomUUID()}`;
      await client.query(`INSERT INTO public.usage_events
        (event_id,organization_id,product_id,product_instance_id,environment,source_system,source_event_id,
         idempotency_key,membership_id,team_id,meter_key,meter_version,quantity,unit,occurred_at,reported_at,
         disposition,envelope,signature)
        VALUES ($1,$2,$3,$4,'test','snapshot-fixture',$5,$5,$6,$7,$8,1,$9,'unit',now()-interval '1 hour',now(),'accepted',
          jsonb_build_object('payload',jsonb_build_object('capabilityKey',$10::text)), '{}'::jsonb)`,
      [eventId, organization, product, instance, sourceId, membershipId, teamId, meter.meterKey, quantity, capabilityKey]);
    };
    const insertAggregatedUsage = async (
      meterKey: "peak" | "state", quantity: string, eventId: string, occurredAt: string, reportedAt: string,
    ) => {
      const sourceId = `snapshot-${crypto.randomUUID()}`;
      await admin.query(`INSERT INTO public.usage_events
        (event_id,organization_id,product_id,product_instance_id,environment,source_system,source_event_id,
         idempotency_key,membership_id,team_id,meter_key,meter_version,quantity,unit,occurred_at,reported_at,
         disposition,envelope,signature)
        VALUES ($1,$2,$3,$4,'test','snapshot-fixture',$5,$5,$6,$7,$8,1,$9,'unit',$10,$11,'accepted',
          jsonb_build_object('payload',jsonb_build_object('capabilityKey',NULL)), '{}'::jsonb)`,
      [eventId, organization, product, instance, sourceId, membership, team, meterKey, quantity, occurredAt, reportedAt]);
    };

    try {
      await admin.query(`CREATE ROLE ${serviceRole} LOGIN PASSWORD '${servicePassword}' NOSUPERUSER NOBYPASSRLS`);
      await admin.query(`GRANT company_human_service TO ${serviceRole}`);
      await admin.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS`);
      await admin.query(`GRANT company_human_budget_snapshot TO ${runtimeRole}`);
      await admin.query("INSERT INTO users(id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp) VALUES($1,'https://snapshot.test',$1,'Snapshot actor','active',1)", [actor]);
      for (const [id, slug] of [[organization, `snapshot-${suffix}`], [otherOrganization, `snapshot-other-${suffix}`]] as const) {
        await admin.query("INSERT INTO organizations(id,slug,name,owner_user_id) VALUES($1,$2,'Snapshot organization',$3)", [id, slug, actor]);
      }
      await admin.query("INSERT INTO roles(id,organization_id,key) VALUES($1,$2,'owner')", [role, organization]);
      await admin.query("INSERT INTO role_permissions(organization_id,role_id,permission_key) SELECT $1,$2,permission_key FROM role_permission_defaults WHERE role_key='owner'", [organization, role]);
      await admin.query("INSERT INTO memberships(id,organization_id,user_id,status,role_key,role_id) VALUES($1,$2,$3,'active','owner',$4)", [membership, organization, actor, role]);
      await admin.query("INSERT INTO products(id,product_key,display_name,catalog_status,catalog_metadata) VALUES($1,$2,'Snapshot product','ready',$3)", [product, `snapshot-${suffix}`, metadata]);
      await admin.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'compute',1,'unit','sum','Compute')", [product]);
      await admin.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'peak',1,'unit','maximum','Peak')", [product]);
      await admin.query("INSERT INTO meter_definitions(product_id,meter_key,version,unit,aggregation,display_name) VALUES($1,'state',1,'unit','last','State')", [product]);
      await admin.query("INSERT INTO product_instances(id,organization_id,product_id,instance_key,mode,desired_enabled,provisioning_status,created_by_user_id) VALUES($1,$2,$3,'main','connected',true,'active',$4)", [instance, organization, product, actor]);
      await admin.query("INSERT INTO product_memberships(id,organization_id,product_instance_id,membership_id,desired_enabled,provisioning_status,external_member_id,provider_receipt_reference,provisioned_at,created_by_user_id) VALUES($1,$2,$3,$4,true,'active','member-1','receipt-1',now(),$5)", [createCanonicalId("productMembership"), organization, instance, membership, actor]);
      await admin.query("INSERT INTO teams(id,organization_id,name) VALUES($1,$2,'Snapshot team')", [team, organization]);
      await admin.query("INSERT INTO team_memberships(organization_id,team_id,membership_id,team_role) VALUES($1,$2,$3,'member')", [organization, team, membership]);

      const policyScopes = [
        { kind: "organization", product_instance_id: null, team_id: null, membership_id: null, capability_key: null },
        { kind: "product", product_instance_id: null, team_id: null, membership_id: null, capability_key: null },
        { kind: "product_instance", product_instance_id: instance, team_id: null, membership_id: null, capability_key: null },
        { kind: "team", product_instance_id: null, team_id: team, membership_id: null, capability_key: null },
        { kind: "member", product_instance_id: null, team_id: null, membership_id: membership, capability_key: null },
        { kind: "capability", product_instance_id: null, team_id: null, membership_id: null, capability_key: "compute" },
        { kind: "meter", product_instance_id: null, team_id: null, membership_id: null, capability_key: null },
      ] as const;
      const serviceClient = new Client({ connectionString: service.toString() });
      await serviceClient.connect();
      try {
        await serviceClient.query("BEGIN");
        await serviceClient.query("SELECT set_config('company_human.user_id',$1,true),set_config('company_human.organization_id',$2,true)", [actor, organization]);
        for (const [index, scope] of policyScopes.entries()) {
          const policyId = policyIds[index]!;
          await serviceClient.query(`INSERT INTO budget_policies
            (id,organization_id,product_id,meter_key,meter_version,unit,window_key,scope_kind,product_instance_id,team_id,membership_id,capability_key,created_by_user_id)
            VALUES($1,$2,$3,'compute',1,'unit','utc_month',$4,$5,$6,$7,$8,$9)`,
          [policyId, organization, product, scope.kind, scope.product_instance_id, scope.team_id, scope.membership_id, scope.capability_key, actor]);
          await serviceClient.query(`INSERT INTO budget_policy_revisions
            (organization_id,budget_policy_id,revision,maximum_quantity,action,status,actor_user_id)
            VALUES($1,$2,1,'100','warning','active',$3)`, [organization, policyId, actor]);
        }
        for (const meterKey of ["peak", "state"] as const) {
          const policyId = createCanonicalId("budget");
          await serviceClient.query(`INSERT INTO budget_policies
            (id,organization_id,product_id,meter_key,meter_version,unit,window_key,scope_kind,created_by_user_id)
            VALUES($1,$2,$3,$4,1,'unit','utc_month','organization',$5)`,
          [policyId, organization, product, meterKey, actor]);
          await serviceClient.query(`INSERT INTO budget_policy_revisions
            (organization_id,budget_policy_id,revision,maximum_quantity,action,status,actor_user_id)
            VALUES($1,$2,1,'100','warning','active',$3)`, [organization, policyId, actor]);
        }
        await serviceClient.query("COMMIT");
      } finally {
        await serviceClient.end();
      }

      const zero = await readBudgetConsumptionSnapshot(runtime.toString(), { actorUserId: actor, operation, environment: "test" });
      expect(zero.providerEnforcementConfirmed).toBe(false);
      expect(zero.authorizesUsage).toBe(false);
      expect(zero.evaluation.constraints).toHaveLength(7);
      expect(zero.evaluation.constraints.every(constraint => constraint.usageQuantity === "0")).toBe(true);

      await insertUsage(admin, "2.500000", membership, team, "compute");

      const after = await readBudgetConsumptionSnapshot(runtime.toString(), { actorUserId: actor, operation, environment: "test" });
      expect(after.evaluation.constraints.every(constraint => constraint.usageQuantity === "2.5")).toBe(true);

      const peakOperation: BudgetOperationV1 = {
        ...operation, capabilityKey: null, meter: { meterKey: "peak", meterVersion: 1, unit: "unit" },
      };
      const stateOperation: BudgetOperationV1 = {
        ...operation, capabilityKey: null, meter: { meterKey: "state", meterVersion: 1, unit: "unit" },
      };
      const peakInput = { actorUserId: actor, operation: peakOperation, environment: "test" as const };
      const stateInput = { actorUserId: actor, operation: stateOperation, environment: "test" as const };
      for (const input of [peakInput, stateInput]) {
        const empty = await readBudgetConsumptionSnapshot(runtime.toString(), input);
        expect(empty.evaluation.constraints).toHaveLength(1);
        expect(empty.evaluation.constraints[0]?.usageQuantity).toBe("0");
      }
      const now = new Date();
      const older = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const newer = now.toISOString();
      await insertAggregatedUsage("peak", "2", createCanonicalId("event"), older, older);
      await insertAggregatedUsage("peak", "9.5", createCanonicalId("event"), newer, newer);
      await insertAggregatedUsage("peak", "4", createCanonicalId("event"), newer, newer);
      const peak = await readBudgetConsumptionSnapshot(runtime.toString(), peakInput);
      expect(peak.evaluation.constraints[0]?.usageQuantity).toBe("9.5");

      await insertAggregatedUsage("state", "12", createCanonicalId("event"), older, older);
      const tiedIds = [createCanonicalId("event"), createCanonicalId("event")].sort();
      await insertAggregatedUsage("state", "3", tiedIds[0]!, newer, newer);
      await insertAggregatedUsage("state", "7", tiedIds[1]!, newer, newer);
      const state = await readBudgetConsumptionSnapshot(runtime.toString(), stateInput);
      expect(state.evaluation.constraints[0]?.usageQuantity).toBe("7");

      await insertUsage(admin, "1", null, team, "compute");
      await expect(readBudgetConsumptionSnapshot(runtime.toString(), { actorUserId: actor, operation, environment: "test" }))
        .rejects.toBeInstanceOf(BudgetConsumptionSnapshotIncompleteError);

      await expect(readBudgetConsumptionSnapshot(runtime.toString(), {
        actorUserId: actor,
        operation: { ...operation, membershipId: null, operationTeam: { ...operation.operationTeam!, membershipId: null } },
        environment: "test",
      })).rejects.toBeInstanceOf(BudgetConsumptionSnapshotIncompleteError);

      const deniedOperation = { ...operation, organizationId: otherOrganization } as BudgetOperationV1;
      await expect(readBudgetConsumptionSnapshot(runtime.toString(), { actorUserId: actor, operation: deniedOperation, environment: "test" }))
        .rejects.toBeInstanceOf(BudgetConsumptionSnapshotDeniedError);
      await expect(readBudgetConsumptionSnapshot(databaseUrl!, { actorUserId: actor, operation, environment: "test" }))
        .rejects.toBeInstanceOf(BudgetConsumptionSnapshotDeniedError);
      const writeReader = new Client({ connectionString: runtime.toString() });
      await writeReader.connect();
      try {
        await writeReader.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        await writeReader.query("SET LOCAL ROLE company_human_budget_snapshot");
        await expect(writeReader.query("INSERT INTO products(id,product_key,display_name) VALUES($1,$2,'forbidden')", [createCanonicalId("product"), `forbidden-${suffix}`]))
          .rejects.toThrow(/read-only|permission denied/i);
        await writeReader.query("ROLLBACK");
      } finally {
        await writeReader.end();
      }
    } finally {
      // The fixture deliberately lives in a disposable database. Usage and
      // budget history are immutable, so row deletion would violate their
      // production triggers and obscure the assertion being tested.
      await admin.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
      await admin.query(`DROP ROLE IF EXISTS ${serviceRole}`);
      await admin.end();
    }
  });
});

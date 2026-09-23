import { expect, it } from "vitest";
import { Client } from "pg";
import { createCanonicalId } from "@company-human/contracts";

const databaseUrl = process.env.DATABASE_URL;

it.skipIf(!databaseUrl)("projects signed capability attribution under tenant RLS", async () => {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  await db.query("BEGIN");

  try {
    const user = createCanonicalId("user");
    const organization = createCanonicalId("organization");
    const foreignOrganization = createCanonicalId("organization");
    const product = createCanonicalId("product");
    const instance = createCanonicalId("productInstance");
    const foreignInstance = createCanonicalId("productInstance");
    const membership = createCanonicalId("membership");
    const role = createCanonicalId("role");
    const attributedEvent = createCanonicalId("event");
    const legacyEvent = createCanonicalId("event");
    const foreignEvent = createCanonicalId("event");

    await db.query(
      `INSERT INTO users
        (id,auth_issuer,auth_subject,display_name,status,provider_event_timestamp)
       VALUES ($1,'https://usage-capability.test',$1,'Capability reader','active',1)`,
      [user],
    );
    for (const [id, slug] of [
      [organization, "usage-capability"],
      [foreignOrganization, "foreign-capability"],
    ] as const) {
      await db.query(
        `INSERT INTO organizations (id,slug,name,owner_user_id)
         VALUES ($1,$2,'Capability storage test',$3)`,
        [id, slug, user],
      );
    }
    await db.query("INSERT INTO roles (id,organization_id,key) VALUES ($1,$2,'owner')", [role, organization]);
    await db.query(
      `INSERT INTO role_permissions (organization_id,role_id,permission_key)
       SELECT $1,$2,permission_key FROM role_permission_defaults WHERE role_key='owner'`,
      [organization, role],
    );
    await db.query(
      `INSERT INTO memberships (id,organization_id,user_id,status,role_key,role_id)
       VALUES ($1,$2,$3,'active','owner',$4)`,
      [membership, organization, user, role],
    );
    await db.query(
      "INSERT INTO products (id,product_key,display_name) VALUES ($1,$2,'Capability product')",
      [product, `usage-capability-${crypto.randomUUID()}`],
    );
    for (const [id, organizationId, instanceKey] of [
      [instance, organization, "main"],
      [foreignInstance, foreignOrganization, "foreign"],
    ] as const) {
      await db.query(
        `INSERT INTO product_instances
          (id,organization_id,product_id,instance_key,mode,created_by_user_id)
         VALUES ($1,$2,$3,$4,'connected',$5)`,
        [id, organizationId, product, instanceKey, user],
      );
    }
    await db.query(
      `INSERT INTO meter_definitions
        (product_id,meter_key,version,unit,aggregation,display_name)
       VALUES ($1,'requests',1,'request','sum','Requests')`,
      [product],
    );

    const insertFixture = async (options: {
      eventId: string;
      organizationId: string;
      instanceId: string;
      sourceEventId: string;
      envelope: object;
      signature?: object;
      occurredAt: string;
    }) => {
      await db.query(
        `INSERT INTO usage_events
          (event_id,organization_id,product_id,product_instance_id,environment,
           source_system,source_event_id,idempotency_key,membership_id,team_id,
           meter_key,meter_version,quantity,unit,occurred_at,reported_at,
           disposition,envelope,signature)
         VALUES ($1,$2,$3,$4,'test','fixture',$5,$5,NULL,NULL,
           'requests',1,1,'request',$6,$7,'accepted',$8::jsonb,$9::jsonb)`,
        [
          options.eventId,
          options.organizationId,
          product,
          options.instanceId,
          options.sourceEventId,
          options.occurredAt,
          options.occurredAt,
          JSON.stringify(options.envelope),
          JSON.stringify(options.signature ?? { keyId: "fixture-key", value: "private" }),
        ],
      );
    };

    await insertFixture({
      eventId: attributedEvent,
      organizationId: organization,
      instanceId: instance,
      sourceEventId: "attributed",
      occurredAt: "2026-01-02T00:00:00Z",
      envelope: { payload: { capabilityKey: "outbound-enrichment" } },
    });
    await insertFixture({
      eventId: legacyEvent,
      organizationId: organization,
      instanceId: instance,
      sourceEventId: "legacy",
      occurredAt: "2026-01-03T00:00:00Z",
      envelope: {},
    });
    await insertFixture({
      eventId: foreignEvent,
      organizationId: foreignOrganization,
      instanceId: foreignInstance,
      sourceEventId: "foreign",
      occurredAt: "2026-01-04T00:00:00Z",
      envelope: { payload: { capabilityKey: "outbound-enrichment" } },
    });

    await db.query("SAVEPOINT invalid_capability");
    await expect(
      insertFixture({
        eventId: createCanonicalId("event"),
        organizationId: organization,
        instanceId: instance,
        sourceEventId: "empty-capability",
        occurredAt: "2026-01-05T00:00:00Z",
        envelope: { payload: { capabilityKey: "" } },
      }),
    ).rejects.toThrow("usage_events_capability_key_format");
    await db.query("ROLLBACK TO SAVEPOINT invalid_capability");
    await db.query("RELEASE SAVEPOINT invalid_capability");

    await db.query("SAVEPOINT direct_override");
    await expect(
      db.query(
        `INSERT INTO usage_events
          (event_id,organization_id,product_id,product_instance_id,environment,
           source_system,source_event_id,idempotency_key,membership_id,team_id,
           meter_key,meter_version,quantity,unit,occurred_at,reported_at,
           disposition,envelope,signature,capability_key)
         SELECT $1,organization_id,product_id,product_instance_id,environment,
           source_system,$2,$2,membership_id,team_id,meter_key,meter_version,
           quantity,unit,occurred_at,reported_at,disposition,envelope,signature,
           'forged'
         FROM usage_events WHERE event_id=$3`,
        [createCanonicalId("event"), "direct-override", attributedEvent],
      ),
    ).rejects.toThrow(/generated column|cannot insert/i);
    await db.query("ROLLBACK TO SAVEPOINT direct_override");
    await db.query("RELEASE SAVEPOINT direct_override");

    await db.query("SAVEPOINT direct_rewrite");
    await expect(
      db.query("UPDATE usage_events SET capability_key='forged' WHERE event_id=$1", [attributedEvent]),
    ).rejects.toThrow(/immutable|generated|cannot update|updated to DEFAULT/i);
    await db.query("ROLLBACK TO SAVEPOINT direct_rewrite");
    await db.query("RELEASE SAVEPOINT direct_rewrite");

    const privileges = await db.query<{ can_select: boolean; can_insert: boolean; can_update: boolean }>(
      `SELECT has_column_privilege('company_human_app','public.usage_events','capability_key','SELECT') AS can_select,
              has_table_privilege('company_human_app','public.usage_events','INSERT') AS can_insert,
              has_table_privilege('company_human_app','public.usage_events','UPDATE') AS can_update`,
    );
    expect(privileges.rows[0]).toEqual({ can_select: true, can_insert: false, can_update: false });

    await db.query("SET LOCAL ROLE company_human_app");
    await db.query("SELECT set_config('company_human.organization_id',$1,true),set_config('company_human.user_id',$2,true)", [organization, user]);
    expect((await db.query("SELECT current_user AS role")).rows[0]?.role).toBe("company_human_app");

    const visible = await db.query<{ event_id: string; organization_id: string; capability_key: string | null }>(
      `SELECT event_id,organization_id,capability_key
       FROM public.usage_events ORDER BY occurred_at`,
    );
    expect(visible.rows).toEqual([
      { event_id: attributedEvent, organization_id: organization, capability_key: "outbound-enrichment" },
      { event_id: legacyEvent, organization_id: organization, capability_key: null },
    ]);

    for (const column of ["envelope", "signature"] as const) {
      await db.query("SAVEPOINT private_column");
      await expect(db.query(`SELECT ${column} FROM public.usage_events`)).rejects.toThrow("permission denied");
      await db.query("ROLLBACK TO SAVEPOINT private_column");
      await db.query("RELEASE SAVEPOINT private_column");
    }
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
});

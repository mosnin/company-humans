import { createCanonicalId, MembershipIdSchema, OrganizationIdSchema, ROLE_KEYS, UserIdSchema, type MembershipId, type OrganizationId, type UserId } from "@company-human/contracts";
import { Client } from "pg";
import { z } from "zod";
import { appendIdentityAudit } from "./identity-audit.js";

const CreateOrganizationSchema = z.object({
  ownerUserId: UserIdSchema,
  slug: z.string().regex(/^[a-z][a-z0-9-]{2,62}$/),
  name: z.string().trim().min(1).max(256),
}).strict();

export interface CreatedOrganization {
  organizationId: OrganizationId;
  ownerMembershipId: MembershipId;
}

export async function createOrganization(databaseUrl: string, input: z.input<typeof CreateOrganizationSchema>): Promise<CreatedOrganization> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const { ownerUserId, slug, name } = CreateOrganizationSchema.parse(input);
  const organizationId = createCanonicalId("organization");
  const ownerMembershipId = createCanonicalId("membership");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const owner = await client.query("SELECT 1 FROM users WHERE id = $1 AND status = 'active'", [ownerUserId]);
    if (owner.rowCount !== 1) throw new Error("Active canonical owner required");
    await client.query(
      "INSERT INTO organizations (id, slug, name, owner_user_id) VALUES ($1, $2, $3, $4)",
      [organizationId, slug, name, ownerUserId],
    );
    const roles = ROLE_KEYS.map((key) => ({ key, id: createCanonicalId("role") }));
    for (const role of roles) {
      await client.query("INSERT INTO roles (id, organization_id, key) VALUES ($1, $2, $3)", [role.id, organizationId, role.key]);
    }
    await client.query(
      `INSERT INTO memberships (id, organization_id, user_id, status, role_key, sponsor_type, joined_at)
       VALUES ($1, $2, $3, 'active', 'owner', 'organization', now())`,
      [ownerMembershipId, organizationId, ownerUserId],
    );
    await appendIdentityAudit(client, {
      organizationId, actorUserId: ownerUserId, actorMembershipId: ownerMembershipId,
      action: "organization.created", targetType: "organization", targetId: organizationId,
      afterState: { slug, name, ownerUserId },
    });
    for (const role of roles) {
      await appendIdentityAudit(client, {
        organizationId, actorUserId: ownerUserId, actorMembershipId: ownerMembershipId,
        action: "role.created", targetType: "role", targetId: role.id,
        afterState: { key: role.key },
      });
    }
    await appendIdentityAudit(client, {
      organizationId, actorUserId: ownerUserId, actorMembershipId: ownerMembershipId,
      action: "membership.created", targetType: "membership", targetId: ownerMembershipId,
      afterState: { userId: ownerUserId, roleKey: "owner", status: "active", sponsorType: "organization" },
    });
    await client.query("COMMIT");
    return { organizationId, ownerMembershipId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export interface OrganizationSummary {
  id: OrganizationId;
  slug: string;
  name: string;
  membershipId: MembershipId;
  roleKey: string;
  sponsorType: string;
}

/** The caller's canonical user ID is mandatory. This query never scans other tenants. */
export async function listOrganizationsForUser(databaseUrl: string, userId: UserId): Promise<OrganizationSummary[]> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  UserIdSchema.parse(userId);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      id: string; slug: string; name: string; membership_id: string; role_key: string; sponsor_type: string;
    }>(
      `SELECT o.id, o.slug, o.name, m.id AS membership_id, m.role_key, m.sponsor_type
       FROM memberships m JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = $1 AND m.status = 'active' AND o.status = 'active'
       ORDER BY o.name, o.id`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: OrganizationIdSchema.parse(row.id),
      slug: row.slug,
      name: row.name,
      membershipId: MembershipIdSchema.parse(row.membership_id),
      roleKey: row.role_key,
      sponsorType: row.sponsor_type,
    }));
  } finally {
    await client.end();
  }
}

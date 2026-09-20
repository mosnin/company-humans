import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OrganizationIdSchema } from "@company-human/contracts";
import { listVisibleOrganizations, resolveAccessContext } from "@company-human/database/rls";
import { resolveAuthenticatedUser } from "./authenticated-user";

export const getWorkspace = cache(async () => {
  const identity = await resolveAuthenticatedUser().catch(() => ({ status: "unavailable" as const }));
  if (identity.status === "unauthenticated") redirect("/sign-in");
  if (identity.status !== "ok" || !process.env.DATABASE_RUNTIME_URL) return null;
  const selected = OrganizationIdSchema.safeParse((await cookies()).get("ch_active_org")?.value);
  if (!selected.success) redirect("/workspace/select");
  const data = await Promise.all([
    resolveAccessContext(process.env.DATABASE_RUNTIME_URL, identity.userId, selected.data),
    listVisibleOrganizations(process.env.DATABASE_RUNTIME_URL, identity.userId),
  ]).catch(() => null);
  if (!data) return null;
  const [context, organizations] = data;
  if (!context) redirect("/workspace/select");
  const organization = organizations.find(item => item.id === context.organizationId);
  if (!organization) redirect("/workspace/select");
  return { context, organization };
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook: vi.fn() }));
vi.mock("@company-human/database/clerk-users", () => ({ syncClerkUser: vi.fn() }));

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalSecret === undefined) delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  else process.env.CLERK_WEBHOOK_SIGNING_SECRET = originalSecret;
  vi.resetAllMocks();
});

function request(): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/clerk", { method: "POST" });
}

describe("Clerk webhook boundary", () => {
  it("fails closed when signing configuration is absent", async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    expect((await POST(request())).status).toBe(503);
  });

  it("rejects an unverified delivery before database mutation", async () => {
    process.env.DATABASE_URL = "postgresql://invalid-local-test";
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = "test-secret";
    const { verifyWebhook } = await import("@clerk/nextjs/webhooks");
    const { syncClerkUser } = await import("@company-human/database/clerk-users");
    vi.mocked(verifyWebhook).mockRejectedValue(new Error("invalid signature"));
    expect((await POST(request())).status).toBe(400);
    expect(syncClerkUser).not.toHaveBeenCalled();
  });
});

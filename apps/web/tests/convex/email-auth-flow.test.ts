import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.ts");
let links: URL[];
beforeEach(async () => {
  links = [];
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  vi.stubEnv("JWT_PRIVATE_KEY", await exportPKCS8(privateKey));
  vi.stubEnv("CONVEX_SITE_URL", "https://auth.example.test");
  vi.stubEnv("SITE_URL", "https://human.example.test");
  vi.stubEnv("AUTH_RESEND_KEY", "test-only");
  vi.stubEnv("AUTH_EMAIL_FROM", "login@example.test");
  // Only delivery is intercepted. The actual auth action, token storage,
  // verification, identity callback and session creation run in convex-test.
  vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
    expect(input).toBe("https://api.resend.com/emails");
    links.push(new URL(JSON.parse(init.body as string).text.split("\n")[2]));
    return new Response("{}", { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("issues an invitation-return link, verifies identity once, and rejects replay", async () => {
  const t = convexTest(schema, modules);
  await t.action(api.auth.signIn, { provider: "email", params: { email: "person@example.test", redirectTo: "/auth/complete?returnTo=invite" } });
  expect(links[0]!.searchParams.get("returnTo")).toBe("invite");
  const before = await t.run(ctx => ctx.db.query("users").collect());
  expect(before).toHaveLength(1);
  expect(before[0]!.emailVerificationTime).toBeUndefined();
  const params = { email: "person@example.test", code: links[0]!.searchParams.get("token")! };
  const result = await t.action(api.auth.signIn, { provider: "email", params });
  expect(result.tokens?.token).toBeTypeOf("string");
  const after = await t.run(ctx => ctx.db.get(before[0]!._id));
  expect(after?.emailVerificationTime).toBeTypeOf("number");
  const sessions = await t.run(ctx => ctx.db.query("authSessions").collect());
  expect(sessions).toHaveLength(1);
  expect(await t.withIdentity({ subject: `${before[0]!._id}|${sessions[0]!._id}` }).query(api.identity.current, {})).toMatchObject({ verifiedEmail: "person@example.test" });
  await expect(t.action(api.auth.signIn, { provider: "email", params })).rejects.toThrow("Could not verify code");
});
it("rejects email substitution and expired tokens without creating a session", async () => {
  const t = convexTest(schema, modules);
  await t.action(api.auth.signIn, { provider: "email", params: { email: "person@example.test" } });
  const code = links[0]!.searchParams.get("token")!;
  await expect(t.action(api.auth.signIn, { provider: "email", params: { email: "other@example.test", code } })).rejects.toThrow("Could not verify code");
  await t.run(async ctx => {
    const token = await ctx.db.query("authVerificationCodes").unique();
    await ctx.db.patch(token!._id, { expirationTime: Date.now() - 1 });
  });
  await expect(t.action(api.auth.signIn, { provider: "email", params: { email: "person@example.test", code } })).rejects.toThrow("Could not verify code");
  expect(await t.run(ctx => ctx.db.query("authSessions").collect())).toHaveLength(0);
});
it("resending invalidates the earlier link", async () => {
  const t = convexTest(schema, modules);
  const request = { provider: "email", params: { email: "person@example.test" } };
  await t.action(api.auth.signIn, request);
  await t.action(api.auth.signIn, request);
  await expect(t.action(api.auth.signIn, { provider: "email", params: { email: "person@example.test", code: links[0]!.searchParams.get("token")! } })).rejects.toThrow("Could not verify code");
  expect((await t.action(api.auth.signIn, { provider: "email", params: { email: "person@example.test", code: links[1]!.searchParams.get("token")! } })).tokens?.token).toBeTypeOf("string");
});
it("bounds direct email requests before delivery and preserves the latest valid link", async () => {
  const t = convexTest(schema, modules);
  const request = { provider: "email", params: { email: "person@example.test" } };
  for (let i = 0; i < 5; i++) await t.action(api.auth.signIn, request);
  await expect(t.action(api.auth.signIn, request)).rejects.toThrow("Too many sign-in requests");
  expect(links).toHaveLength(5);
  expect((await t.action(api.auth.signIn, { provider: "email", params: { email: "person@example.test", code: links[4]!.searchParams.get("token")! } })).tokens?.token).toBeTypeOf("string");
});
it("enforces global delivery capacity and rolls back recipient reservation on denial", async () => {
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert("authEmailRequestLimits", { key: "global", windowStart: Date.now(), count: 1000 }));
  await expect(t.action(api.auth.signIn, { provider: "email", params: { email: "person@example.test" } })).rejects.toThrow("Too many sign-in requests");
  expect(links).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.query("users").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.query("authEmailRequestLimits").collect())).toHaveLength(1);
});
it("restores capacity when the hourly window expires", async () => {
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert("authEmailRequestLimits", { key: "global", windowStart: Date.now() - 3600001, count: 1000 }));
  await t.action(api.auth.signIn, { provider: "email", params: { email: "person@example.test" } });
  expect(links).toHaveLength(1);
});

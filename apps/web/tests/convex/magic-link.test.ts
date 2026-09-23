import { afterEach, expect, it, vi } from "vitest";
import { magicLink } from "../../convex/magicLink";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const send = (magicLink.options as typeof magicLink).sendVerificationRequest;
const request = { identifier: "person@example.test", token: "secret-token", url: "https://human.example/auth/complete?returnTo=invite" } as Parameters<typeof send>[0];
it("fails closed without email configuration", async () => {
  vi.stubEnv("AUTH_RESEND_KEY", "");
  await expect(send(request)).rejects.toThrow("unavailable");
});
it("sends a short lived confirmation link without automatic code redemption", async () => {
  vi.stubEnv("SITE_URL", "https://human.example"); vi.stubEnv("AUTH_RESEND_KEY", "test-key"); vi.stubEnv("AUTH_EMAIL_FROM", "Company Human <login@human.example>");
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 200 })); vi.stubGlobal("fetch", fetch);
  await send(request);
  const payload = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
  const link = new URL(payload.text.split("\n")[2]);
  expect(link.pathname).toBe("/sign-in/email");
  expect(link.searchParams.get("token")).toBe("secret-token");
  expect(link.searchParams.get("code")).toBeNull();
  expect(link.searchParams.get("email")).toBe(request.identifier);
  expect(link.searchParams.get("returnTo")).toBe("invite");
  expect(magicLink.options?.maxAge).toBe(900);
});
it("does not expose delivery provider errors", async () => {
  vi.stubEnv("SITE_URL", "https://human.example"); vi.stubEnv("AUTH_RESEND_KEY", "test-key"); vi.stubEnv("AUTH_EMAIL_FROM", "login@human.example");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  await expect(send(request)).rejects.toThrow("Email sign-in unavailable");
});

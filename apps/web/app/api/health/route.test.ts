import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalRevision = process.env.VERCEL_GIT_COMMIT_SHA;
const originalRelease = process.env.COMPANY_HUMAN_REVISION;

afterEach(() => {
  if (originalRelease === undefined) delete process.env.COMPANY_HUMAN_REVISION;
  else process.env.COMPANY_HUMAN_REVISION = originalRelease;
  if (originalRevision === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = originalRevision;
});

describe("Company Human health route", () => {
  it("uses an explicit release revision when CLI metadata is empty", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "";
    process.env.COMPANY_HUMAN_REVISION = "a".repeat(40);
    expect((await GET().json()).revision).toBe("a".repeat(40));
  });
  it("reports unknown rather than an empty revision when metadata is absent", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "";
    delete process.env.COMPANY_HUMAN_REVISION;
    expect((await GET().json()).revision).toBeNull();
  });
  it("reports its own service identity and deployment revision without tenant data", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "scaffold-test-revision";
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: "company-human",
      status: "ok",
      revision: "scaffold-test-revision",
    });
  });
});

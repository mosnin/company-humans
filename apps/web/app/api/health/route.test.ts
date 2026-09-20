import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalRevision = process.env.VERCEL_GIT_COMMIT_SHA;

afterEach(() => {
  if (originalRevision === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = originalRevision;
});

describe("Company Human health route", () => {
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

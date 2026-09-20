import { describe, expect, it } from "vitest";
import { CAPABILITIES, ROLE_CAPABILITIES, ROLE_KEYS, roleHasCapability } from "./permissions.js";

describe("initial role policy", () => {
  it("resolves all six roles without granting finance, CRM, or integration secrets by accident", () => {
    expect(ROLE_KEYS).toHaveLength(6);
    expect(ROLE_CAPABILITIES.owner).toEqual(CAPABILITIES);
    expect(roleHasCapability("admin", "members.manage")).toBe(true);
    expect(roleHasCapability("admin", "payouts.read.all")).toBe(false);
    expect(roleHasCapability("manager", "assignments.manage.team")).toBe(true);
    expect(roleHasCapability("manager", "assignments.manage.all")).toBe(false);
    expect(roleHasCapability("manager", "teams.manage.assigned")).toBe(true);
    expect(roleHasCapability("manager", "teams.manage.all")).toBe(false);
    expect(roleHasCapability("contributor", "earnings.read.own")).toBe(true);
    expect(roleHasCapability("contributor", "payouts.read.all")).toBe(false);
    expect(roleHasCapability("contributor", "crm.read.team")).toBe(false);
    expect(roleHasCapability("finance", "payouts.read.all")).toBe(true);
    expect(roleHasCapability("finance", "crm.read.own")).toBe(false);
    expect(roleHasCapability("finance", "context.read.approved")).toBe(false);
    expect(roleHasCapability("developer", "integrations.manage")).toBe(true);
    expect(roleHasCapability("developer", "payouts.read.all")).toBe(false);
    expect(roleHasCapability("developer", "crm.read.own")).toBe(false);
  });
});

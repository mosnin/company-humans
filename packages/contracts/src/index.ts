/** Versioned cross-service contracts owned by Company Human. */
export const CONTRACT_NAMESPACE = "company-human" as const;
export * from "./ids.js";
export * from "./permissions.js";
export * from "./app-catalog.js";
export * from "./product-adapter.js";
export * from "./envelopes.js";
export * from "./entitlements.js";
export * from "./product-adapter-v2.js";

export * from "./usage-limits.js";
export * from "./usage-limit-adapter.js";
export * from "./usage-limits-v2.js";
export * from "./usage-limit-adapter-v2.js";
export * from "./capability-adapter.js";

export * from "./adapter-health.js";
export * from "./usage-events.js";
export * from "./product-meter-enforcement.js";
export * from "./member-access-adapter.js";

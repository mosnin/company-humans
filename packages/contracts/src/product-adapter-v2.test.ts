import { describe, expect, it, vi } from "vitest";
import { createCanonicalId } from "./ids.js";
import { assertProductAdapterV1, PRODUCT_ADAPTER_METHODS } from "./product-adapter.js";
import { assertProductAdapterV2, IncompatibleMemberProvisioningAdapter, SuspendedMemberProvisionRequestSchema, SuspendedMemberProvisionResultSchema } from "./product-adapter-v2.js";

describe("suspended member creation contract", () => {
  it("rejects a complete V1 adapter without invoking it; preserves existing V1 compatibility", () => {
    const call=vi.fn();
    const methods=Object.fromEntries(PRODUCT_ADAPTER_METHODS.map(method=>[method,call]));
    const old={contractVersion:1,...methods};
    expect(()=>assertProductAdapterV1(old)).not.toThrow();
    expect(()=>assertProductAdapterV2(old)).toThrow(IncompatibleMemberProvisioningAdapter);
    expect(call).not.toHaveBeenCalled();
    expect(()=>assertProductAdapterV2({...old,contractVersion:2})).not.toThrow();
    for(const missing of PRODUCT_ADAPTER_METHODS) {
      expect(()=>assertProductAdapterV2({...old,contractVersion:2,[missing]:undefined})).toThrow(IncompatibleMemberProvisioningAdapter);
    }
  });
  it("requires explicit initial denial and canonical tenant/member identities", () => {
    const request={organizationId:createCanonicalId('organization'),productInstanceId:createCanonicalId('productInstance'),membershipId:createCanonicalId('membership'),idempotencyKey:'member-command-1',initialAccess:'suspended'};
    expect(SuspendedMemberProvisionRequestSchema.parse(request)).toEqual(request);
    for(const patch of [{initialAccess:undefined},{initialAccess:'active'},{membershipId:request.organizationId},{idempotencyKey:''},{limits:{credits:Infinity}}]) {
      expect(SuspendedMemberProvisionRequestSchema.safeParse({...request,...patch}).success).toBe(false);
    }
  });
  it("never accepts active or removed membership as successful suspended creation", () => {
    const suspended={status:'succeeded',value:{externalMemberId:'remote-member',status:'suspended'}};
    expect(SuspendedMemberProvisionResultSchema.parse(suspended)).toEqual(suspended);
    for(const status of ['active','removed','pending',undefined]) {
      expect(SuspendedMemberProvisionResultSchema.safeParse({...suspended,value:{...suspended.value,status}}).success).toBe(false);
    }
    expect(SuspendedMemberProvisionResultSchema.safeParse({...suspended,value:{...suspended.value,externalMemberId:''}}).success).toBe(false);
    expect(SuspendedMemberProvisionResultSchema.safeParse({...suspended,credentials:'secret'}).success).toBe(false);
  });
  it("distinguishes pending, bounded retry and permanent failure without arbitrary provider details", () => {
    for(const response of [{status:'pending',operationId:'provider-job'},{status:'retryable_failure',code:'temporarily_unavailable',retryAfterSeconds:60},{status:'permanent_failure',code:'unsupported_initial_denial'}]) {
      expect(SuspendedMemberProvisionResultSchema.parse(response)).toEqual(response);
    }
    for(const response of [{status:'pending',operationId:''},{status:'retryable_failure',code:'retry',retryAfterSeconds:Infinity},{status:'retryable_failure',code:'retry',retryAfterSeconds:0},{status:'permanent_failure',code:'Authorization: secret token'}]) {
      expect(SuspendedMemberProvisionResultSchema.safeParse(response).success).toBe(false);
    }
  });
});

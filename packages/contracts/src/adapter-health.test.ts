import { describe, expect, it } from "vitest";
import { AdapterHealthSchema, AdapterHealthStatusSchema, assessAdapterHealth } from "./adapter-health.js";

const now=new Date("2026-09-21T12:00:00Z"), maxAge=300000;
const observation={status:"healthy",checkedAt:now.toISOString()};
describe("adapter health observation boundary",()=>{
  it.each(AdapterHealthStatusSchema.options)("preserves actual status %s without inferring access",status=>{
    const result=assessAdapterHealth({...observation,status},now,maxAge);
    expect(result).toEqual({state:"current",observation:{status,checkedAt:now.toISOString(),lastSuccessfulSyncAt:null,lastFailureAt:null,affectedMembers:null}});
  });
  it("expires at the policy boundary and never presents old healthy as current",()=>{
    expect(assessAdapterHealth(observation,new Date(now.getTime()+maxAge-1),maxAge).state).toBe("current");
    expect(assessAdapterHealth(observation,new Date(now.getTime()+maxAge),maxAge).state).toBe("stale");
    expect(assessAdapterHealth({...observation,checkedAt:"2026-09-21T14:00:00+02:00"},now,maxAge).state).toBe("current");
  });
  it("rejects future timestamps rather than extending freshness",()=>{
    expect(assessAdapterHealth({...observation,checkedAt:"2026-09-21T12:00:01Z"},now,maxAge)).toEqual({state:"unknown",reason:"future_observation"});
  });
  it.each([null,undefined])("marks missing observations unknown",raw=>{
    expect(assessAdapterHealth(raw,now,maxAge)).toEqual({state:"unknown",reason:"missing_observation"});
  });
  it.each([
    {...observation,status:"active"}, {...observation,checkedAt:"yesterday"},
    {...observation,lastSuccessfulSyncAt:"2026-09-21T12:01:00Z"},
    {...observation,lastFailureAt:"2026-09-21T12:01:00Z"},
    {...observation,affectedMembers:-1}, {...observation,affectedMembers:1.5},
    {...observation,affectedMembers:Number.MAX_SAFE_INTEGER+1},
    {...observation,accessGranted:true}, {...observation,providerStatus:"x".repeat(513)},
  ])("fails closed for malformed provider data %j",raw=>{
    expect(assessAdapterHealth(raw,now,maxAge)).toEqual({state:"unknown",reason:"invalid_observation"});
  });
  it("retains explicit zero and historical times but excludes provider free text",()=>{
    const result=assessAdapterHealth({...observation,affectedMembers:0,providerStatus:"secret-bearing upstream message",lastSuccessfulSyncAt:"2026-09-21T11:59:00Z",lastFailureAt:"2026-09-21T11:58:00Z"},now,maxAge);
    expect(result.state).toBe("current");expect(JSON.stringify(result)).not.toContain("secret-bearing");
    if(result.state!=="unknown")expect(result.observation.affectedMembers).toBe(0);
    expect(AdapterHealthSchema.safeParse({...observation,affectedMembers:0}).success).toBe(true);
  });
  it.each([0,-1,Infinity,NaN,0.5,Number.MAX_SAFE_INTEGER+1])("rejects invalid maximum age %s",age=>{
    expect(()=>assessAdapterHealth(observation,now,age)).toThrow("valid clock");
  });
  it("rejects an invalid trusted clock",()=>{
    expect(()=>assessAdapterHealth(observation,new Date(NaN),maxAge)).toThrow("valid clock");
  });
});

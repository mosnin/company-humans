import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { requestProductMembership } from "@company-human/database/product-memberships";
vi.mock("@/lib/authenticated-user",()=>({resolveAuthenticatedUser:vi.fn()}));
vi.mock("@company-human/database/product-memberships",()=>({requestProductMembership:vi.fn()}));
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
const org=`ch_org_${'a'.repeat(32)}`,instance=`ch_inst_${'a'.repeat(32)}`,member=`ch_mem_${'a'.repeat(32)}`,user=`ch_usr_${'a'.repeat(32)}` as never,mapping=`ch_pmem_${'a'.repeat(32)}` as never;
const context={params:Promise.resolve({organizationId:org,instanceId:instance})};
const request=(body:unknown={membershipId:member},origin:string|null='https://human.example.test')=>new NextRequest(`https://human.example.test/api/organizations/${org}/applications/${instance}/members`,{method:'POST',headers:{...(origin?{origin}:{}),'content-type':'application/json'},body:JSON.stringify(body)});
function auth(){vi.stubEnv('DATABASE_SERVICE_URL','postgresql://fixture');vi.mocked(resolveAuthenticatedUser).mockResolvedValue({status:'ok',userId:user});}
it('records intent with server identity without inventing a provider result',async()=>{
 auth();vi.mocked(requestProductMembership).mockResolvedValue(mapping);
 const response=await POST(request(),context);expect(response.status).toBe(202);
 expect(response.headers.get('cache-control')).toBe('no-store');
 expect(await response.json()).toEqual({productMembershipId:mapping,providerAccessConfirmed:false});
 expect(requestProductMembership).toHaveBeenCalledWith('postgresql://fixture',{actorUserId:user,organizationId:org,productInstanceId:instance,membershipId:member});
});
it.each([null,'https://foreign.test'])('rejects origin %s before identity',async origin=>{
 expect((await POST(request({membershipId:member},origin),context)).status).toBe(403);expect(resolveAuthenticatedUser).not.toHaveBeenCalled();
});
it.each([['unauthenticated',401],['forbidden',403],['unavailable',503]] as const)('denies %s',async(status,code)=>{
 vi.mocked(resolveAuthenticatedUser).mockResolvedValue({status});expect((await POST(request(),context)).status).toBe(code);expect(requestProductMembership).not.toHaveBeenCalled();
});
it.each([null,{membershipId:org},{membershipId:member,actorUserId:user},{membershipId:member,organizationId:org},{membershipId:member,desiredEnabled:true}])('rejects invalid or forged fields %j',async body=>{
 auth();expect((await POST(request(body),context)).status).toBe(400);expect(requestProductMembership).not.toHaveBeenCalled();
});
it('rejects invalid URL scope',async()=>{auth();expect((await POST(request(),{params:Promise.resolve({organizationId:'bad',instanceId:instance})})).status).toBe(400);expect(requestProductMembership).not.toHaveBeenCalled();});
it.each([['Application administration denied',403],['Product or membership unavailable',403],['Product membership requires reconciliation before re-enabling',409],['private database detail',503]] as const)('normalizes failure %s',async(message,status)=>{
 auth();vi.mocked(requestProductMembership).mockRejectedValue(new Error(message));const response=await POST(request(),context);expect(response.status).toBe(status);expect(await response.text()).not.toContain('private database detail');
});
it('fails closed without database configuration',async()=>{auth();vi.stubEnv('DATABASE_SERVICE_URL','');expect((await POST(request(),context)).status).toBe(503);expect(requestProductMembership).not.toHaveBeenCalled();});

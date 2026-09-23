import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { resolveAuthenticatedUser } from "@/lib/authenticated-user";
import { requestProductConnection } from "@company-human/database/product-connections";
vi.mock("@/lib/authenticated-user",()=>({resolveAuthenticatedUser:vi.fn()}));
vi.mock("@company-human/database/product-connections",()=>({requestProductConnection:vi.fn()}));
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
const org=`ch_org_${'a'.repeat(32)}`,instance=`ch_inst_${'a'.repeat(32)}`,user=`ch_usr_${'a'.repeat(32)}` as never,mapping=`ch_op_${'a'.repeat(32)}` as never;
const context={params:Promise.resolve({organizationId:org,instanceId:instance})};
const request=(body:unknown={externalOrganizationId:"scalar-org"},origin:string|null='https://human.example.test')=>new NextRequest(`https://human.example.test/api/organizations/${org}/applications/${instance}/connect`,{method:'POST',headers:{...(origin?{origin}:{}),'content-type':'application/json'},body:JSON.stringify(body)});
function auth(){vi.stubEnv('DATABASE_SERVICE_URL','postgresql://fixture');vi.mocked(resolveAuthenticatedUser).mockResolvedValue({status:'ok',userId:user});}
it('records intent with server identity without inventing a provider result',async()=>{
 auth();vi.mocked(requestProductConnection).mockResolvedValue(mapping);
 const response=await POST(request(),context);expect(response.status).toBe(202);
 expect(response.headers.get('cache-control')).toBe('no-store');
 expect(await response.json()).toEqual({operationId:mapping,providerConnectionConfirmed:false});
 expect(requestProductConnection).toHaveBeenCalledWith('postgresql://fixture',{actorUserId:user,organizationId:org,productInstanceId:instance,externalOrganizationId:"scalar-org"});
});
it.each([null,'https://foreign.test'])('rejects origin %s before identity',async origin=>{
 expect((await POST(request({externalOrganizationId:"scalar-org"},origin),context)).status).toBe(403);expect(resolveAuthenticatedUser).not.toHaveBeenCalled();
});
it.each([['unauthenticated',401],['forbidden',403],['unavailable',503]] as const)('denies %s',async(status,code)=>{
 vi.mocked(resolveAuthenticatedUser).mockResolvedValue({status});expect((await POST(request(),context)).status).toBe(code);expect(requestProductConnection).not.toHaveBeenCalled();
});
it.each([null,{externalOrganizationId:" "},{externalOrganizationId:"x".repeat(257)},{externalOrganizationId:42},{externalOrganizationId:"scalar-org",actorUserId:user},{externalOrganizationId:"scalar-org",organizationId:org},{externalOrganizationId:"scalar-org",desiredEnabled:true}])('rejects invalid or forged fields %j',async body=>{
 auth();expect((await POST(request(body),context)).status).toBe(400);expect(requestProductConnection).not.toHaveBeenCalled();
});
it('rejects invalid URL scope',async()=>{auth();expect((await POST(request(),{params:Promise.resolve({organizationId:'bad',instanceId:instance})})).status).toBe(400);expect(requestProductConnection).not.toHaveBeenCalled();});
it.each([['Application administration denied',403],['Product connection unavailable',403],['Connection target cannot change during setup',409],['private database detail',503]] as const)('normalizes failure %s',async(message,status)=>{
 auth();vi.mocked(requestProductConnection).mockRejectedValue(new Error(message));const response=await POST(request(),context);expect(response.status).toBe(status);expect(await response.text()).not.toContain('private database detail');
});
it('fails closed without database configuration',async()=>{auth();vi.stubEnv('DATABASE_SERVICE_URL','');expect((await POST(request(),context)).status).toBe(503);expect(requestProductConnection).not.toHaveBeenCalled();});

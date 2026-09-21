import { afterEach, expect, it, vi } from "vitest";
import ApplicationHealthPage from "./page";
import { getWorkspace } from "@/lib/workspace";
import { readApplicationHealth } from "@company-human/database/administration";
vi.mock("@/lib/workspace",()=>({getWorkspace:vi.fn()}));
vi.mock("@company-human/database/administration",()=>({readApplicationHealth:vi.fn()}));
vi.mock("@/components/administration/application-health",()=>({ApplicationHealth:()=>null}));
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
const org=`ch_org_${"a".repeat(32)}`,user=`ch_usr_${"b".repeat(32)}`,instance=`ch_inst_${"c".repeat(32)}`;
const params={params:Promise.resolve({instanceId:instance})};
function workspace(allowed=true){vi.stubEnv("DATABASE_SERVICE_URL","postgresql://fixture");vi.mocked(getWorkspace).mockResolvedValue({context:{userId:user,organizationId:org,capabilities:allowed?["applications.manage"]:[]}} as never);}
it("does not query tenant data without a workspace",async()=>{vi.mocked(getWorkspace).mockResolvedValue(null);expect(await ApplicationHealthPage(params)).toBeNull();expect(readApplicationHealth).not.toHaveBeenCalled();});
it("denies a contributor before the health query",async()=>{workspace(false);expect((await ApplicationHealthPage(params))?.props.title).toBe("Application health restricted");expect(readApplicationHealth).not.toHaveBeenCalled();});
it("uses the authenticated workspace scope and keeps missing observations distinct from unavailable reads",async()=>{
 workspace();vi.mocked(readApplicationHealth).mockResolvedValue(null);const result=await ApplicationHealthPage(params);
 expect(readApplicationHealth).toHaveBeenCalledWith("postgresql://fixture",user,org,instance);expect(result?.props.children[2].props.health).toBeNull();
});
it("normalizes denied or invalid instance reads without leaking database errors",async()=>{
 workspace();vi.mocked(readApplicationHealth).mockRejectedValue(new Error("private database detail"));const result=await ApplicationHealthPage(params);
 expect(result?.props.title).toBe("Application health unavailable");expect(result?.props.description).toBe("Check your access or try again.");
});
it("fails closed without service configuration",async()=>{workspace();vi.stubEnv("DATABASE_SERVICE_URL","");expect((await ApplicationHealthPage(params))?.props.title).toBe("Application health unavailable");expect(readApplicationHealth).not.toHaveBeenCalled();});

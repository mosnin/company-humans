import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks=vi.hoisted(()=>({workspace:vi.fn(),apps:vi.fn()}));
vi.mock("@/lib/workspace",()=>({getWorkspace:mocks.workspace}));
vi.mock("@company-human/database/rls",()=>({listMemberApplications:mocks.apps}));
import Page from "./page";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('DATABASE_RUNTIME_URL','postgresql://runtime');mocks.workspace.mockResolvedValue({context:{userId:'user',organizationId:'org'},organization:{name:'Example Team'}});mocks.apps.mockResolvedValue([]);});
it('uses the authenticated organization and user for contributor reads',async()=>{
 const html=renderToStaticMarkup(await Page());expect(mocks.apps).toHaveBeenCalledWith('postgresql://runtime','user','org');expect(html).toContain('No apps assigned yet');
});
it('does not query without a workspace',async()=>{mocks.workspace.mockResolvedValue(null);expect(await Page()).toBeNull();expect(mocks.apps).not.toHaveBeenCalled();});
it('does not turn read failures into empty assignments or leak errors',async()=>{mocks.apps.mockRejectedValue(new Error('private provider details'));const html=renderToStaticMarkup(await Page());expect(html).toContain('could not be loaded');expect(html).not.toContain('private provider');expect(html).not.toContain('No apps assigned');});
it('shows assignment states without claiming launch authority',async()=>{mocks.apps.mockResolvedValue(['preparing','suspended','unavailable','access_check_required','access_update_pending'].map((status,id)=>({id:String(id),name:'Scalar',instanceKey:'primary',status})));const html=renderToStaticMarkup(await Page());for(const label of ['Being prepared','Access paused','Currently unavailable','Access needs verification','Access update pending'])expect(html).toContain(label);expect(html).not.toContain('<a');});

it('distinguishes a pending access update from a confirmed provider suspension',async()=>{mocks.apps.mockResolvedValue([{id:'mapping',name:'Scalar',instanceKey:'primary',status:'access_update_pending'}]);const html=renderToStaticMarkup(await Page());expect(html).toContain('Access update pending');expect(html).toContain('Your organization is updating access to this tool.');expect(html).not.toContain('Access paused');expect(html).not.toContain('<a');});

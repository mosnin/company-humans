"""Compile the canonical task snapshot with the installed goal-route-system.

Execution metadata only: does not accept product capabilities or call providers.
"""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = Path.home() / '.codex/skills/company-os/goal-route-system/scripts/goal_route.py'
spec = importlib.util.spec_from_file_location('goal_route', SKILL)
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
tasks = json.loads((ROOT / 'docs/execution/notion-tasks.json').read_text())['results']
assert len(tasks) == 92 and {t['Task ID'] for t in tasks} == set(range(1, 93))
objective = ('Build and independently verify the complete Company Human platform in mosnin/company-humans '
 'against the canonical Notion tree and phases 00–16. Preserve company-os-web. Use Convex OAuth, '
 'organization-sponsored ecosystem access with Scalar first, scoped roles and admin activity visibility, '
 'bounded usage and centralized commercial control, modular human work/CRM/context/creator workspaces, '
 'recoverable Chippi referral attribution, immutable commissions and real regulated payouts while '
 'merchant billing remains independent. Verify sales, referral and UGC configurations without forks. '
 'Use Symbolic context and Flow when connected; inspect Callix UTM tracking for reuse. '
 'Expansion remains conditional on stable first-party contracts and actual demand.')
state = g.compile_goal_route('company-human', objective, autonomy_mode='autonomous')
state['kickoff_profile'].update({
 'repository':'https://github.com/mosnin/company-humans',
 'write_scope':['company-humans','Company Human Notion tracker and specification corrections'],
 'read_only_sources':['company-os-web','callix','ecosystem product repositories'],
 'source_scaffold_sha':'94827a320e06958995263b32a44d6fc8c227d7a1',
 'baseline_sha':'4b9d614', 'task_snapshot_date':'2026-09-21',
 'execution':'one bounded task at a time; no agent dispatch implied by role labels',
 'approval_boundaries':['No paid upgrades or unrelated deployment deletions','Real money execution requires provider compliance and specific transaction authorization'],
 'resource_policy':'No user token or time cap supplied. Time fields are Notion effort estimates, not deadlines. Zero token/cost allocations mean unallocated, not permission to spend.',
 'unknowns':['OAuth provider configuration','development deployment capacity','live Scalar control API','regulated payout provider and jurisdiction'],
 'overrides':['Convex OAuth replaces Clerk','repository is company-humans and is public','all three external beta configurations required'],
 'source_manifest':'docs/execution/specification-sources.json',
})
cohesion=state['cohesion_contract']
cohesion['principles'] += ['Thin shared kernel; specialized products retain domain authority',
 'Preserve Company OS design language and responsive primitives',
 'Contributor UI emphasizes work, progress, earnings and allowed tools',
 'Organization sponsors access; independent organizations bill independently',
 'No unlimited expensive usage; deny uncontrolled spend during failures',
 'Tenant scope enforced in database, server, API, jobs, adapters, exports, search, analytics and cache',
 'Merchant billing is independent; append financial corrections with provenance',
 'No simulated provider success; local tests and live acceptance remain distinct']
cohesion=g.seal(cohesion,'cohesion_sha256');state['cohesion_contract']=cohesion
root=state['goals'][0]
root['cohesion_sha256']=cohesion['cohesion_sha256']
root['budget']={'time_minutes':sum(t['Effort Days'] for t in tasks)*480,'token_limit':0,'cost_usd':0}
root['authority']['effects']=['local_source_changes','local_runtime','network_research','destination_git_push','destination_deployment','notion_tracker_update']
root['current_state']={'baseline':'4b9d614','foundation':'CI verified at 3fbc494 / run 35522115426','identity':'partial; Convex deployed, real OAuth not verified','later_phases':'not verified'}
root['required_state_changes']=[{'state_change_id':f'phase:{i:02}','description':f'Pass canonical Phase {i:02} acceptance'} for i in range(17)]
root['target_state']['conditions']=[x['description'] for x in root['required_state_changes']]
root['tasks']=[]
root['evidence_required']=['Exact revision and environment receipts','Independent runtime acceptance','Real Chippi loop including merchant billing outage independence','All three external beta configurations']
state['goals']=[root];state['route_segments']=[];state['sprints']=[]
groups=[range(0,4),range(4,7),range(7,9),range(9,12),range(12,14),range(14,17)]
for index, phases in enumerate(groups,1):
 mid=f'goal:company-human:program:{index}'
 subset=[t for t in tasks if int(t['Phase'][:2]) in phases]
 budget={'time_minutes':sum(t['Effort Days'] for t in subset)*480,'token_limit':0,'cost_usd':0}
 manager=g._goal(goal_id=mid,root_goal_id=root['goal_id'],parent_goal_id=root['goal_id'],goal_type='sequential_phase_group',level='manager',purpose=f'Phases {phases.start:02}–{phases.stop-1:02}',budget=budget,authority_effects=root['authority']['effects'],cohesion_sha256=cohesion['cohesion_sha256'],artifact_classes=['integrated-product'],contributes_to=[f'phase:{i:02}' for i in phases])
 manager['required_state_changes']=[{'state_change_id':f'phase:{i:02}','description':f'Canonical Phase {i:02} exit gate'} for i in phases];manager['tasks']=[]
 state['goals'].append(manager)
 for phase in phases:
  pt=[t for t in subset if int(t['Phase'][:2])==phase]; pid=f'goal:company-human:phase:{phase:02}'
  pg=g._goal(goal_id=pid,root_goal_id=root['goal_id'],parent_goal_id=mid,goal_type='phase',level='submanager',purpose=pt[0]['Phase'],budget={'time_minutes':sum(t['Effort Days'] for t in pt)*480,'token_limit':0,'cost_usd':0},authority_effects=root['authority']['effects'],cohesion_sha256=cohesion['cohesion_sha256'],artifact_classes=['phase-acceptance'],contributes_to=[f'phase:{phase:02}'],conditions=[t['Acceptance'] for t in pt])
  pg['required_state_changes']=[{'state_change_id':f"CH-{t['Task ID']}",'description':t['Acceptance']} for t in pt];pg['tasks']=[]
  pg['dependencies']=[] if phase==0 else [f'goal:company-human:phase:{phase-1:02}']
  pg['execution_gate']='Accepted previous phase; independent work may proceed only with recorded blocker and no dependent acceptance claim'
  state['goals'].append(pg)
  for t in pt:
   tid=f"CH-{t['Task ID']}"
   leaf=g._goal(goal_id=f'goal:company-human:{tid}',root_goal_id=root['goal_id'],parent_goal_id=pid,goal_type='implementation_task',level='worker',purpose=t['Task'],budget={'time_minutes':t['Effort Days']*480,'token_limit':0,'cost_usd':0},authority_effects=root['authority']['effects'],cohesion_sha256=cohesion['cohesion_sha256'],artifact_classes=['product-code','acceptance-receipt'],contributes_to=[tid],conditions=[t['Acceptance']])
   leaf.update({'notion_url':t['url'],'dependency':t['Dependency'],'reported_tracker_status':t['Status'],'priority':t['Priority'],'workstream':t['Workstream'],'acceptance_state':'unverified_in_route','write_scope':['company-humans'],'evidence_required':['Read task requirement and relevant code','Tests, typecheck, lint and production build','Runtime/provider evidence matching acceptance scope','Tenant/security denial checks where applicable','Coherent commit, synchronized docs and Notion receipt'],'abort_conditions':['cross-tenant leakage','uncontrolled spend','merchant billing dependency','destructive financial history'],'fallback':'Record blocker, preserve accepted work, select next independent bounded task without advancing phase','report_contract':'revision, requirement, changes, checks, environment, remaining gate'})
   state['goals'].append(leaf)
 segment={'route_segment_id':f'program:{index}','position':index,'purpose':manager['purpose'],'phase_order':list(phases),'owner_goal_id':mid,'entry_conditions':['previous program accepted'] if index>1 else ['existing baseline inspected'],'exit_conditions':[f'Phase {i:02} independently accepted' for i in phases],'failure_exit':'record concrete blocker and preserve root digest','degraded_path':'independent task only; no phase acceptance','rollback':'revert bounded product commit or use documented forward migration; never rewrite applied migrations or financial history','reroute_trigger':'contradictory requirement, unavailable provider, or failed acceptance','verification':'exact-scope runtime evidence and independent review'}
 state['route_segments'].append(segment)
 state['sprints'].append({'sprint_id':f'sprint:{index}','route_segment_id':segment['route_segment_id'],'goal':manager['purpose'],'exit_conditions':segment['exit_conditions'],'execution':'sequential bounded task dispatch; phase order unchanged'})
state['blockers']=[{'id':'SYMBOLIC-CONNECTION','evidence':'2026-09-21 connection-doctor: 401 oauth_challenge_missing','impact':'Symbolic Context Compiler and Flow live gates unavailable; no authenticated read verified'},{'id':'IDENTITY-OAUTH','evidence':'dedicated Convex deployed; OAuth provider credentials and SITE_URL absent','impact':'real identity journey remains unverified'},{'id':'CONVEX-DEV-CAPACITY','evidence':'DeploymentQuotaReached after production created','impact':'separate cloud development deployment unavailable'}]
state=g.verify_state(g._reseal_goals(state))
assert len(state['goals'])==116
assert [p for segment in state['route_segments'] for p in segment['phase_order']]==list(range(17))
assert sum(x['goal_type']=='implementation_task' for x in state['goals'])==92
out=ROOT/'docs/execution/goal-route.json'
if out.exists():
    previous=g.verify_state(json.loads(out.read_text()))
    if previous['state_sha256'] != state['state_sha256']:
        raise SystemExit('Existing route differs: preserve its evidence and use an explicit versioned reroute.')
else:
    out.write_text(json.dumps(state,indent=2)+'\n')
print(json.dumps(g.summary(state),indent=2))

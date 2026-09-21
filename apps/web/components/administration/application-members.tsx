import Link from "next/link";
import type { ApplicationMemberDiagnostic } from "@company-human/database/administration";
import { AdminTable } from "./controls";
const labels: Record<string,string>={queued:'Awaiting worker',pending:'Awaiting worker',running:'Request in progress',retry_wait:'Waiting to retry',failed:'Needs attention',superseded:'Newer request exists'};
function progress(member:ApplicationMemberDiagnostic):string {
  if(!member.denial)return 'No suspension or removal requested';
  if(member.denial.status==='succeeded')return member.denial.operation==='removeMember'?'Provider reported removal':'Provider reported suspension';
  return labels[member.denial.status]??'Status unavailable';
}
export function ApplicationMembers({members,instanceId}:{members:ApplicationMemberDiagnostic[];instanceId?:string}) {
  return <><p className="mb-4 t-body text-ink-2">Requested access does not prove product access. Suspension and removal remain unconfirmed until the provider reports success.</p>
    <AdminTable label="Application member access"><thead><tr><th scope="col">Member</th><th scope="col">Workspace membership</th><th scope="col">Requested product access</th><th scope="col">Latest offboarding request</th></tr></thead><tbody>
      {members.map(member=><tr key={member.id}><td>{member.memberName}{instanceId&&<Link className="mt-2 block t-link" href={`/workspace/applications/${instanceId}/entitlements?member=${member.membershipId}`}>Access settings</Link>}{instanceId&&<Link className="mt-2 block t-link" href={`/workspace/applications/${instanceId}/usage-limits?member=${member.membershipId}`}>Usage limits</Link>}</td><td className="capitalize">{member.membershipStatus}</td><td>{member.desiredEnabled?'Requested':'Denied'}</td><td><div className="min-w-52 space-y-2">
        <p>{progress(member)}</p>
        {member.denial&&<><p className="t-caption text-ink-3">{member.denial.attemptCount} of 5 attempts used</p>{member.denial.failureCode&&<p className="t-caption text-ink-2 break-all">{member.denial.failureCode.replaceAll('_',' ')}</p>}
        {!!member.denial.attempts.length&&<details><summary className="cursor-pointer t-body text-ink-2">Attempt history</summary><ol className="mt-2 space-y-3">{member.denial.attempts.map(attempt=><li key={attempt.number}>
          <p className="t-caption">Attempt {attempt.number} · {(attempt.outcome??'In progress').replaceAll('_',' ')}</p>
          <time className="t-caption text-ink-3" dateTime={attempt.startedAt}>{new Date(attempt.startedAt).toISOString().replace('T',' ').slice(0,19)} UTC</time>
          {attempt.failureCode&&<p className="t-caption text-ink-2 break-all">{attempt.failureCode.replaceAll('_',' ')}</p>}
        </li>)}</ol></details>}</>}
      </div></td></tr>)}
      {!members.length&&<tr><td colSpan={4} className="h-40 text-center text-ink-2">No members mapped to this application.</td></tr>}
    </tbody></AdminTable>
  </>;
}

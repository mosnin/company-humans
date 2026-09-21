import type { UsageLimitDelivery } from "@company-human/database/administration";
const deliveryLabels: Record<UsageLimitDelivery['status'],string> = {
  pending:'Awaiting delivery',running:'Delivery in progress',retry_wait:'Waiting to retry',succeeded:'Provider readback received',failed:'Needs attention',superseded:'Request no longer current',
};
export function DeliveryStatus({delivery,configured,label,successDescription='This records a past check of this limit. It does not confirm current product access or every applicable limit.'}:{delivery:UsageLimitDelivery|null;configured:boolean;label:string;successDescription?:string}) {
  if (!configured) return null;
  return <div className="mt-3 space-y-2 t-caption text-ink-2" aria-label={label}>
    <p>{label}: {delivery?deliveryLabels[delivery.status]:'Awaiting status update'}</p>
    {delivery && <><p>{delivery.attemptCount} of 5 attempts used</p>
      {delivery.status==='succeeded' && <p>{successDescription}</p>}
      {delivery.failureCode && <p className="break-all">Delivery issue: {delivery.failureCode.replaceAll('_',' ')}</p>}
      {delivery.nextAttemptAt && <p>Next retry after <UtcTime value={delivery.nextAttemptAt} /></p>}
      <p>Status recorded <UtcTime value={delivery.updatedAt} /></p>
      {delivery.attempts.length>0 && <details><summary className="cursor-pointer">Delivery attempts</summary><ol className="mt-2 space-y-2">{delivery.attempts.map(attempt=><li key={attempt.number}>
        <p>Attempt {attempt.number}: {(attempt.outcome??'in progress').replaceAll('_',' ')}</p><UtcTime value={attempt.startedAt} />
        {attempt.finishedAt && <p>Finished <UtcTime value={attempt.finishedAt} /></p>}
        {attempt.failureCode && <p>{attempt.failureCode.replaceAll('_',' ')}</p>}
      </li>)}</ol></details>}
    </>}
  </div>;
}
function UtcTime({value}:{value:string}) {return <time dateTime={value}>{new Date(value).toISOString().replace('T',' ').slice(0,19)} UTC</time>;}

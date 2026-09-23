import { assertProductMemberAccessAdapterV1, MemberAccessResultSchema, MemberAccessOperationSchema,
  matchesMemberAccessCommand, type OrganizationId, type ProductId, type MemberAccessResult } from '@company-human/contracts';
import { claimMemberDenial, finishMemberDenial } from './member-denial-worker.js';
/** Execute existing durable lifecycle denials only. No activation registration or grant exists here. */
export async function dispatchFencedMemberDenial(url:string,organizationId:OrganizationId,
  registration:{productId:ProductId;adapter:unknown}):Promise<'idle'|'processed'> {
  assertProductMemberAccessAdapterV1(registration.adapter);
  const adapter=registration.adapter;
  const lease=await claimMemberDenial(url,organizationId,registration.productId,true);
  if(!lease)return 'idle';
  if(lease.bindingFailure){
    await finishMemberDenial(url,organizationId,lease,{status:'permanent_failure',code:lease.bindingFailure});
    return 'processed';
  }
  const command=lease.accessCommand!;
  async function bounded<T>(run:Promise<T>):Promise<T>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([run,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Adapter timeout')),10000);})]);}
    finally{if(timer)clearTimeout(timer);}
  }
  let result:MemberAccessResult={status:'retryable_failure',code:'adapter_transport_failure'};
  try{
    const scope={organizationId:command.organizationId,productInstanceId:command.productInstanceId,membershipId:command.membershipId,target:command.target};
    // Unknown is not cancellation. The only allowed retry has the identical immutable command/key.
    const operation=MemberAccessOperationSchema.parse(await bounded(adapter.getMemberAccessOperation({...scope,idempotencyKey:command.idempotencyKey})));
    result=operation.status==='applied'?{status:'succeeded',value:operation.value}
      :operation.status==='pending'?operation:operation.status==='rejected'?{status:'permanent_failure',code:operation.code}
      :MemberAccessResultSchema.parse(await bounded(adapter.setMemberAccess(command)));
    if(result.status==='succeeded'){
      if(!matchesMemberAccessCommand(command,result.value))result={status:'permanent_failure',code:'provider_access_receipt_mismatch'};
      else{
        const readback=MemberAccessResultSchema.parse(await bounded(adapter.getMemberAccess(scope)));
        result=readback.status==='succeeded'?(matchesMemberAccessCommand(command,readback.value)?readback:{status:'permanent_failure',code:'provider_access_readback_mismatch'}):readback;
      }
    }
  }catch{result={status:"retryable_failure",code:"adapter_transport_failure"}; /* Raw provider errors never enter the journal. */}
  const receipt=result.status==='succeeded'
    ?{status:'succeeded' as const,value:{externalMemberId:command.target.externalMemberId,status:command.access as 'suspended'|'removed'}}:result;
  await finishMemberDenial(url,organizationId,lease,receipt,result.status==='succeeded'?result.value:undefined);
  return 'processed';
}

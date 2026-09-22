import { Client } from "pg";
import { EventIdSchema, OrganizationIdSchema, UserIdSchema } from "@company-human/contracts";
import { setServiceContext } from "./service-context.js";
export interface UsageReleaseRequest { actorUserId:string;organizationId:string;eventId:string;reason:string }
/** Append-only revalidation receipt is its audit record, preserving the first actor,
 * reason and database timestamp on retries. Requires a caller-owned transaction. */
export async function releaseUsageInTransaction(client:Client,input:UsageReleaseRequest):Promise<{released:boolean}> {
 UserIdSchema.parse(input.actorUserId);OrganizationIdSchema.parse(input.organizationId);EventIdSchema.parse(input.eventId);
 if(typeof input.reason!=="string"||input.reason.trim().length<1||input.reason.trim().length>1000)throw new Error("Invalid release reason");
 const role=await client.query<{allowed:boolean}>(`SELECT pg_has_role(current_user,'company_human_service','member') AND NOT r.rolsuper AND NOT r.rolbypassrls
 AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.usage_events'::regclass),'member') AS allowed FROM pg_roles r WHERE rolname=current_user`);
 if(!role.rows[0]?.allowed)throw new Error('Usage recovery requires a restricted service role');
 await setServiceContext(client,input.actorUserId,input.organizationId);
 const result=await client.query<{released:boolean}>('SELECT company_human_private.release_usage_quarantine($1,$2) AS released',[input.eventId,input.reason]);
 return {released:result.rows[0]!.released};
}
export async function releaseQuarantinedUsage(url:string,input:UsageReleaseRequest) {
 const client=new Client({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:10000});await client.connect();
 try {await client.query('BEGIN');const result=await releaseUsageInTransaction(client,input);await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}

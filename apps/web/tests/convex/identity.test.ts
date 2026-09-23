import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { saveOAuthUser } from "../../convex/authProfile";
const modules = import.meta.glob("../../convex/**/*.ts");
it("rejects unauthenticated, expired and revoked sessions", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.identity.current, {})).toBeNull();
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { name:"Alice", email:"alice@example.test",emailVerificationTime:1,profileUpdatedAt:2 });
    const sessionId = await ctx.db.insert("authSessions",{userId,expirationTime:Date.now()+60000});
    return {userId,sessionId};
  });
  const actor=t.withIdentity({subject:`${ids.userId}|${ids.sessionId}`});
  expect(await actor.query(api.identity.current,{})).toEqual({subject:ids.userId,name:"Alice",verifiedEmail:"alice@example.test",updatedAt:2});
  await t.run(ctx => ctx.db.patch(ids.sessionId,{expirationTime:Date.now()-1}));
  expect(await actor.query(api.identity.current,{})).toBeNull();
  await t.run(ctx => ctx.db.delete(ids.sessionId));
  expect(await actor.query(api.identity.current,{})).toBeNull();
});
it("rejects a session belonging to another identity", async () => {
  const t=convexTest(schema,modules);
  const {alice,bobSession}=await t.run(async ctx=>{
    const alice=await ctx.db.insert("users",{name:"Alice",profileUpdatedAt:1});
    const bob=await ctx.db.insert("users",{name:"Bob",profileUpdatedAt:1});
    const bobSession=await ctx.db.insert("authSessions",{userId:bob,expirationTime:Date.now()+60000});
    return {alice,bobSession};
  });
  expect(await t.withIdentity({subject:`${alice}|${bobSession}`}).query(api.identity.current,{})).toBeNull();
});
it("never links OAuth accounts by matching email and rejects unverified profiles",async()=>{
  const t=convexTest(schema,modules);
  const profile={email:"same@example.test",emailVerified:true,name:"Person"};
  const first=await t.run(ctx=>saveOAuthUser(ctx,{existingUserId:null,profile}));
  const second=await t.run(ctx=>saveOAuthUser(ctx,{existingUserId:null,profile}));
  expect(first).not.toBe(second);
  expect(await t.run(ctx=>saveOAuthUser(ctx,{existingUserId:first,profile}))).toBe(first);
  await expect(t.run(ctx=>saveOAuthUser(ctx,{existingUserId:null,profile:{...profile,emailVerified:false}}))).rejects.toThrow("verified email");
});
it("email request remains unverified until token redemption and cannot downgrade a verified account", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run(ctx => saveOAuthUser(ctx, { existingUserId: null, type: "email", profile: { email: "person@example.test" } }));
  expect((await t.run(ctx => ctx.db.get(id)))?.emailVerificationTime).toBeUndefined();
  await t.run(ctx => saveOAuthUser(ctx, { existingUserId: id, type: "email", profile: { email: "person@example.test", emailVerified: true } }));
  const verified = await t.run(ctx => ctx.db.get(id));
  expect(verified?.emailVerificationTime).toBeTypeOf("number");
  await t.run(ctx => saveOAuthUser(ctx, { existingUserId: id, type: "email", profile: { email: "person@example.test" } }));
  expect(await t.run(ctx => ctx.db.get(id))).toEqual(verified);
});

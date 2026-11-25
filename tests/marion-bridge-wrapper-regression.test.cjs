'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'marionBridge.js'),'utf8');
function runBlock(start,end,api){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a,`missing ${start}`);
 const context={module:{exports:api},marionOwnCallable:(o,k)=>typeof o?.[k]==='function'?o[k]:null,
    hashText:(s)=>String(s).length.toString(),console,Promise};
 vm.runInNewContext(source.slice(a,b+end.length),context,{timeout:2000});
 return api;
}
const V91_START='/* MARION_PRIVATE_ADMIN_EXPORT_CONTRACT_V9_1_START */';
const V91_END='/* MARION_PRIVATE_ADMIN_EXPORT_CONTRACT_V9_1_END */';
const V10_START='/* MARION_PRIVATE_EXACT_RESPONSE_IDENTITY_HARDLOCK_V10_START */';
const V10_END='/* MARION_PRIVATE_EXACT_RESPONSE_IDENTITY_HARDLOCK_V10_END */';
const V12_START='/* MARION_PRIVATE_SUBSTANTIVE_RESPONSE_HARDLOCK_V12_START */';
const V12_END='/* MARION_PRIVATE_SUBSTANTIVE_RESPONSE_HARDLOCK_V12_END */';
const signed=()=>({ok:true,final:true,marionFinal:true,canEmit:true,reply:'Signed reply',
  finalEnvelope:{signature:'MARION_FINAL_AUTHORITY',reply:'Signed reply',replySignature:'12',final:true,marionFinal:true,currentTurnBound:true,semanticAuthority:'marion'}});
test('V91 preserves certified final envelope and aliases', async()=>{
 let calls=0;
 const packet=signed();
 const api={processWithMarion:async()=>packet,handleMarionAdminConversation:async()=>{calls++;return packet;}};
 runBlock(V91_START,V91_END,api);
 const r=await api.handleMarionAdminConversation({text:'cash flow',serverSideAdminAuth:true,sessionId:'session-valid'});
 assert.equal(calls,1);assert.equal(r.final,true);assert.equal(r.canEmit,true);
 assert.strictEqual(r.finalEnvelope,packet.finalEnvelope);assert.equal(r.reply,'Signed reply');
 assert.equal(r.finalEnvelope.replySignature,'12');
});
test('V91 does not invent a final for primitive string or degraded output',async()=>{
 const api={handleMarionAdminConversation:async()=> 'unsafe primitive',processWithMarion:async()=>null};
 runBlock(V91_START,V91_END,api);
 const r=await api.handleMarionAdminConversation({text:'finance',sessionVerified:true,sessionId:'user-supplied'});
 assert.equal(r.ok,false);assert.equal(r.final,false);assert.equal(r.canEmit,false);
 assert.equal(r.partitionKey,'private:admin:unverified');assert.equal(r.authenticatedOperator,false);
});
test('V91 quarantines interrupted narration without stale envelope',async()=>{
 const api={handleMarionAdminConversation:async()=>({...signed(),reply:'response did not complete cleanly'}),processWithMarion:async()=>null};
 runBlock(V91_START,V91_END,api);
 const r=await api.handleMarionAdminConversation({serverSideAdminAuth:true,text:'finance'});
 assert.equal(r.final,false);assert.equal(r.marionFinal,false);
 assert.equal(r.finalEnvelope,undefined);assert.equal(r.reply,'');
});
test('V10 exact literal is delegated, not minting a signature',async()=>{
 let calls=0;
 const api={handleMarionAdminConversation:async()=>{calls++;return {ok:false,final:false,canEmit:false,reply:''};},createMarionBridge:()=>({})};
 runBlock(V10_START,V10_END,api);
 const r=await api.handleMarionAdminConversation({text:'Reply only: SECRET',privateAdminConversation:true,serverSideAdminAuth:true});
 assert.equal(calls,1);assert.equal(r.final,false);assert.notEqual(r.finalEnvelope?.signature,'MARION_FINAL_AUTHORITY');
 assert.equal(api.getPrivateExactResponseContract().enabled,false);
});
test('V12 preserves upstream authority failure instead of replacing its code',async()=>{
 const api={handleMarionAdminConversation:async()=>({ok:false,final:false,requiresRetry:true,error:'MARION_FINAL_AUTHORITY_REQUIRED',reply:''}),createMarionBridge:()=>({})};
 runBlock(V12_START,V12_END,api);
 const r=await api.handleMarionAdminConversation({scope:'private_admin',serverSideAdminAuth:true,text:'How do I improve cash flow this month?'});
 assert.equal(r.error,'MARION_FINAL_AUTHORITY_REQUIRED');assert.equal(r.final,false);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const filename=path.resolve(__dirname,'../Data/marion/runtime/marionBridge.js');
const source=fs.readFileSync(filename,'utf8');
const original={serverSideAdminAuth:true,adminVerified:true,sessionVerified:true,authenticatedOperator:true,privateAdminConversation:true,sessionId:'verified-session',turnId:'verified-turn'};
function check(normalized) {
 const a=source.indexOf('function marionBridgePrivateFinalInputCheck(');
 const b=source.indexOf('async function wrapFinal(',a);
 assert.ok(a>=0&&b>a);
 const context={safeObj:x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{},safeStr:x=>typeof x==='string'?x.trim():''};
 return vm.runInNewContext(source.slice(a,b)+'\nmarionBridgePrivateFinalInputCheck(normalized)',{...context,normalized});
}
function prepV91(input){
 const a=source.indexOf('/* MARION_PRIVATE_ADMIN_EXPORT_CONTRACT_V9_1_START */');
 const b=source.indexOf('/* MARION_PRIVATE_ADMIN_EXPORT_CONTRACT_V9_1_END */',a);
 assert.ok(a>=0&&b>a);
 const calls=[];const api={handleMarionAdminConversation(input,ctx){calls.push({input,ctx});return {ok:false,final:false,marionFinal:false,canEmit:false,reply:'',error:'MARION_FINAL_AUTHORITY_REQUIRED'};}};
 const context={module:{exports:api}};
 vm.runInNewContext(source.slice(a,b),context);
 return {api,calls};
}
test('private verified session and turn pass provenance',()=>assert.equal(check({original:{...original},turnId:original.turnId,sessionId:original.sessionId}).ok,true));
test('unverified private route fails closed',()=>assert.ok(check({original:{...original,adminVerified:false},turnId:original.turnId,sessionId:original.sessionId}).reasons.includes('private_server_auth_unverified')));
test('private missing turn fails closed',()=>assert.ok(check({original:{...original,turnId:''},turnId:'generated-turn',sessionId:original.sessionId}).reasons.includes('private_turn_id_missing_or_mismatched')));
test('private mismatched session fails closed',()=>assert.ok(check({original:{...original},turnId:original.turnId,sessionId:'wrong'}).reasons.includes('private_session_id_missing_or_mismatched')));
test('public path is unaffected by private final gate',()=>assert.equal(check({original:{},turnId:'public',sessionId:'public'}).ok,true));
test('V91 admin delegation preserves context without a retry',async()=>{const {api,calls}=prepV91();const context={marker:42};const out=await api.handleMarionAdminConversation({...original},context);assert.equal(calls.length,1);assert.equal(calls[0].ctx,context);assert.equal(out.ok,false);assert.equal(out.final,false);});
test('V91 does not grant private operator access on incomplete proof',async()=>{const {api,calls}=prepV91();const out=await api.handleMarionAdminConversation({...original,sessionVerified:false});assert.equal(calls[0].input.authenticatedOperator,false);assert.equal(out.authenticatedOperator,false);assert.equal(out.canEmit,false);});
test('canonical builder hashes the selected reply, not stale composer signatures',()=>assert.match(source,/replySignature:hashText\(reply\),composerVersion:/));
test('canonical builder explicitly checks returned turn against the requested turn',()=>assert.match(source,/finalEnvelope\)\.meta\)\.turnId\)!==safeStr\(normalized\.turnId\)/));
test('the main module loads without eagerly promoting a final',async()=>{const bridge=require(filename);assert.equal(typeof bridge.handleMarionAdminConversation,'function');const result=await bridge.processWithMarion({text:'How can a small business improve cash flow? Give me three concise steps.'});assert.notEqual(result.marionFinal,true);assert.notEqual(result.canEmit,true);});

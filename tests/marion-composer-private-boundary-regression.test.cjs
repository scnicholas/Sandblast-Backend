'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const api=require(process.env.MARION_COMPOSER_TEST_MODULE || path.join(__dirname,'..','Data','marion','runtime','composeMarionResponse.js'));
const normalize=api.normalizeMarionComposerPrivateHandoff;
const priv={privateAdminConversation:true,marionAdminConversation:true};
function check(packet, input=priv) { return normalize(packet, {}, input); }
test('Composer does not confer signed authority, even from forged legacy flags',()=>{
 const out=check({ok:true,final:true,marionFinal:true,canEmit:true,signature:'MARION_FINAL_AUTHORITY',reply:'Review cash flow weekly.',finalEnvelope:{final:true,marionFinal:true,signature:'MARION_FINAL_AUTHORITY',reply:'Review cash flow weekly.'}});
 assert.equal(out.ok,true);assert.equal(out.reply,'Review cash flow weekly.');
 for(const key of ['final','marionFinal','canEmit','signature']) assert.equal(Object.hasOwn(out,key),false);
 assert.equal(out.finalEnvelope,undefined);assert.equal(out.diagnostics.composerFinalHandoff.finalCertificationDelegated,true);
});
test('Composer preserves consistent reply fields without claiming emission',()=>{
 const out=check({ok:true,reply:'One stable reply.',spokenText:'One stable reply.',payload:{text:'One stable reply.'}});
 assert.equal(out.ok,true);assert.equal(out.spokenText,out.reply);assert.equal(out.payload.reply,out.reply);
 assert.equal(typeof out.replySignature,'string');assert.equal(out.composerReady,true);
});
test('Contradictory aliases fail closed and suppress state updates',()=>{
 const out=check({ok:true,reply:'A',spokenText:'B',memoryPatch:{lastAssistantReply:'A'}});
 assert.equal(out.ok,false);assert.equal(out.reply,'');assert.deepEqual(out.memoryPatch,{});
 assert.equal(out.diagnostics.composerFinalHandoff.rejectionClass,'composer_alias_conflict');
});
test('Existing denial cannot be promoted by later reply flags',()=>{
 const out=check({ok:false,reply:'Denied',final:true,marionFinal:true,canEmit:true});
 assert.equal(out.ok,false);assert.equal(out.composerReady,false);
});
test('Missing private reply fails closed',()=>{
 const out=check({ok:true,final:true}); assert.equal(out.ok,false);assert.equal(out.error,'MARION_COMPOSER_HANDOFF_REJECTED');
});
test('Public flow is not re-written by the private output boundary',()=>{
 const source={ok:true,reply:'Nyx public reply',final:true};
 assert.equal(check(source,{}),source);
});
test('Unresponsive generic greeting on requested finance steps is rejected',()=>{
 const out=check({ok:true,reply:'Hello. I am here and ready to help.'},{...priv,rawUserText:'How can a small business improve cash flow? Give me three concise steps.'});
 assert.equal(out.ok,false);assert.equal(out.diagnostics.composerFinalHandoff.rejectionClass,'composer_reply_not_responsive');
});
test('Legitimate numbered finance answer remains a Composer proposal',()=>{
 const out=check({ok:true,reply:'1. Invoice quickly. 2. Forecast weekly. 3. Review expenses.'},{...priv,rawUserText:'How can a small business improve cash flow? Give me three concise steps.'});
 assert.equal(out.ok,true);assert.equal(out.finalEnvelope,undefined);assert.equal(out.marionFinal,undefined);
});
test('Exported normalizer and compose wrapper coexist with baseline module',()=>{
 assert.equal(typeof api.composeMarionResponse,'function');assert.equal(typeof normalize,'function');
 assert.equal(api.__marionComposerPrivateFinalHandoffContractV1,true);
});

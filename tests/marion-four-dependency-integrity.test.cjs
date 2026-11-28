'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'../Data/marion/runtime');
const router=require(path.join(root,'marionIntentRouter.js'));
const normalizer=require(path.join(root,'marionCommandNormalizer.js'));
const guard=require(path.join(root,'marionLoopGuard.js'));
// The uploaded emotionRuntime.js depends on four sibling libraries not supplied here.
// Stub only those imports so sanitizer and missing-contract failure can be tested.
const Module=require('node:module');
const emotionFile=path.join(root,'emotion/emotionRuntime.js');
const originalLoad=Module._load;
let emotion;
try {
  Module._load=function(request,parent,isMain){
    if(parent && parent.filename===emotionFile){
      if(request==='./emotionValidator') return {validateResolvedState:x=>({state:x}),buildAllowedFromContracts:()=>({primary:['neutral'],secondary:['unclear']}),clamp01:()=>0};
      if(request==='./emotionSuppressionResolver') return {resolveSuppression:()=>({}),applySuppressionToCandidate:x=>x,normalizeText:x=>String(x||'').toLowerCase()};
      if(request==='./emotionStateTracker') return {updateEmotionState:()=>({})};
      if(request==='./emotionalGovernor') return {governResolvedState:x=>x};
    }
    return originalLoad.call(this,request,parent,isMain);
  };
  emotion=require(emotionFile);
} finally { Module._load=originalLoad; }
const signed={ok:true,final:true,marionFinal:true,canEmit:true,reply:'Canonical finance reply.',finalEnvelope:{ok:true,final:true,marionFinal:true,canEmit:true,currentTurnBound:true,semanticAuthority:'marion',reply:'Canonical finance reply.',replySignature:'test-signed-hash',marionFinalSignature:'test-signed-canonical',meta:{turnId:'test-turn'},completionStatus:{complete:true},adaptiveTrustVerification:{allowEmit:true}}};
const clone=(x)=>JSON.parse(JSON.stringify(x));
test('router never changes an already certified 9I response',()=>{
 assert.equal(typeof router.priority9IR2AAltPressureSpecificFinal,'function');
 const before=clone(signed);const out=router.priority9IR2AAltPressureSpecificFinal('Priority 9I: what is the main risk now?',before);
 assert.deepEqual(out,before);
});
test('router never changes an already certified 9J response',()=>{
 assert.equal(typeof router.priority9JR1ARuntimeDecisionSpecificFinal,'function');
 const before=clone(signed);const out=router.priority9JR1ARuntimeDecisionSpecificFinal(before,'Priority 9J: make the decision');
 assert.deepEqual(out,before);
});
test('router does not rewrite rejected finance packet',()=>{
 const failed={ok:false,final:false,blocked:true,requiresRetry:true,reply:'',error:'MARION_FINAL_AUTHORITY_REQUIRED'};
 assert.deepEqual(router.priority9JR1ARuntimeDecisionSpecificFinal(failed,'Priority 9J: make the decision'),failed);
 assert.deepEqual(router.priority9IR2AAltPressureSpecificFinal('Priority 9I: what is the main risk now?',failed),failed);
});
test('normalizer preserves finance intent while leaving final authority false',()=>{
 const p=normalizer.normalizeCommand({text:'How can a small business improve cash flow? Give me three concise steps.',sessionId:'verified-session',turnId:'verified-turn'});
 assert.equal(p.final,false);assert.equal(p.userText.includes('cash flow'),true);
 assert.equal(p.sessionId,'verified-session');assert.equal(p.turnId,'verified-turn');
});
test('normalizer does not coerce attacker-controlled object fields into identifiers',()=>{
 const hostile={toString(){throw Error('untrusted coercion');}};
 const p=normalizer.normalizeCommand({text:'cash flow',sessionId:hostile,turnId:hostile});
 assert.equal(p.sessionId,'');assert.equal(p.turnId,'');assert.equal(p.final,false);
});
test('loop guard never accepts bare final flags or remembered markers as trusted final',()=>{
 assert.equal(guard.isTrustedFinalPacket({final:true,marionFinal:true,meta:{singleFinalAuthority:true},memoryPatch:{composedOnce:true}}),false);
 assert.equal(guard.isTrustedFinalPacket({ok:false,final:true,marionFinal:true,canEmit:false,finalEnvelope:signed.finalEnvelope}),false);
});
test('loop guard only classifies fully formed final envelope as final',()=>{
 assert.equal(guard.isTrustedFinalPacket(signed),true);
 assert.equal(guard.isTrustedFinalPacket({...signed,finalEnvelope:{...signed.finalEnvelope,completionStatus:{complete:false}}}),false);
});
test('emotion sanitizer bounds cycles and excludes prototype-polluting keys',()=>{
 const input=JSON.parse('{"__proto__":{"poisoned":true},"normal":1}');input.self=input;
 const result=emotion.sanitizePlain(input);
 assert.equal(result.normal,1);assert.equal(result.self,null);
 assert.equal(Object.hasOwn(result,'__proto__'),false);
 assert.equal({}.poisoned,undefined);
});
test('emotion runtime missing contracts fail with a neutral non-authoritative response',()=>{
 const result=emotion.resolveEmotionState('How can I improve cash flow?',{}, {contractDir:'/path-that-does-not-exist-marion-test',forceReload:true});
 assert.equal(result.ok,false);
 assert.equal(result.state?.emotion?.primary,'neutral');
 assert.notEqual(result.final,true);assert.notEqual(result.marionFinal,true);
});

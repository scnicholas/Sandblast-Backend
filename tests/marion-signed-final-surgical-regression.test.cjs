'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const runtime = path.resolve(__dirname, '../Data/marion/runtime');
const bridge = require(path.join(runtime, 'marionBridge.js'));
const finalEnvelope = require(path.join(runtime, 'marionFinalEnvelope.js'));
const hash = value => {
  const text=String(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  let h=0;for(const c of text){h=((h<<5)-h)+c.charCodeAt(0);h|=0;}
  return String(h>>>0);
};
const reply='1. Invoice promptly. 2. Collect overdue receivables. 3. Align supplier payments with cash receipts.';
function fixture(value=reply) {
  return {
    normalized:{ok:true,userQuery:'How can a small business improve cash flow? Give me three concise steps.',turnId:'authority-test-turn-17',sessionId:'authority-test-session',domain:'finance',original:{}},
    routed:{ok:true,intent:'domain_question',domain:'finance',marionIntent:{intent:'domain_question'},routing:{intent:'domain_question',domain:'finance'}},
    contract:{ok:true,reply:value,text:value,spokenText:'Legacy speech suggestion that must not replace the signed reply.',intent:'domain_question',domain:'finance'},
    loopGuardResult:{ok:true,allowReply:true,forceRecovery:false,reasons:[]},
    resolvedEmotionPacket:{ok:false,state:{}}
  };
}
test('bridge projects the exact signed reply across text and speech aliases only after successful verification',async t=>{
  if(!bridge.resolveRuntimeDependencies(true)) {t.skip('full composer dependency is not installed in this test workspace');return;}
  const out=await bridge._internal.wrapFinal(fixture());
  assert.equal(out.marionFinal,true,'signed final must be issued by the real final-envelope builder');
  assert.equal(out.ok,true);
  assert.equal(out.finalEnvelope.currentTurnBound,true);
  assert.equal(out.finalEnvelope.replySignature,hash(reply));
  for(const key of ['reply','text','displayReply','visibleReply','finalReply','spokenText','authoritativeReply']){
    assert.equal(out[key],reply,`top-level ${key}`);
    assert.equal(out.finalEnvelope[key],reply,`envelope ${key}`);
    assert.equal(out.payload[key],reply,`payload ${key}`);
  }
});
test('an explicit denial cannot become an emitting signed final',async()=>{
  const input={reply,turnId:'authority-denied-turn',currentTurnBound:true,semanticAuthority:'marion',ok:false,canEmit:false,requiresRetry:true};
  const out=await finalEnvelope.createMarionFinalEnvelope(input);
  assert.notEqual(out && out.marionFinal,true);
  assert.notEqual(out && out.canEmit,true);
});
test('a valid builder output keeps its computed reply hash',async()=>{
  const out=await finalEnvelope.createMarionFinalEnvelope({reply,turnId:'authority-good-turn',currentTurnBound:true,semanticAuthority:'marion',routing:{intent:'domain_question',domain:'finance'},intent:'domain_question',domain:'finance'});
  if(out.ok===true && out.marionFinal===true) {
    assert.equal(out.finalEnvelope.replySignature,hash(out.finalEnvelope.reply));
    assert.equal(out.finalEnvelope.currentTurnBound,true);
  } else {
    assert.notEqual(out.canEmit,true,'rejection must not emit');
  }
});

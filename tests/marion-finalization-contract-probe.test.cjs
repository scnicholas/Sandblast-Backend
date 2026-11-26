'use strict';
// Safe, local-only diagnostics. This probe never handles a live private session.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mod = require(path.resolve(__dirname, '..', 'Data', 'marion', 'runtime', 'marionFinalEnvelope.js'));
const reply = 'Improve cash flow by collecting invoices promptly, forecasting weekly cash needs, and controlling unnecessary expenses.';
function build(turnId) {
  return mod.createMarionFinalEnvelope({
    reply, currentTurnBound: true, semanticAuthority: 'marion',
    turnId, sessionId: 'synthetic-test-only',
    intent:'business_strategy', domain:'finance',
    routing:{intent:'business_strategy',domain:'finance',knowledgeDomain:'finance'},
    meta:{turnId, bridgeVersion:'synthetic-test-bridge',composerVersion:'synthetic-test-composer'},
    diagnostics:{singleContract:true}
  });
}
function status(packet){
  const e=packet && packet.finalEnvelope || {};
  return {
    builderOk: packet.ok===true,
    final: packet.final===true,
    canEmit: packet.canEmit===true,
    envelopeFinal:e.final===true,
    turnBound:e.currentTurnBound===true,
    completionComplete:e.completionStatus?.complete===true,
    trustAllowsEmit:e.adaptiveTrustVerification?.allowEmit===true,
    contractReasons:mod.validateReplyContract(e).reasons,
    hasSignature:typeof e.signature==='string'&&e.signature.length>0
  };
}
test('synthetic finance reply, with turn ID, meets Final Envelope contract',async()=>{
  const s=status(await build('synthetic-finance-turn-1'));
  console.log('WITH_TURN_ID',JSON.stringify(s));
  assert.equal(s.turnBound,true);
  assert.deepEqual(s.contractReasons,[]);
  assert.equal(s.completionComplete,true);
  assert.equal(s.trustAllowsEmit,true);
});
test('missing turn ID is not accepted as bound to current turn',async()=>{
  const s=status(await build(''));
  console.log('WITHOUT_TURN_ID',JSON.stringify(s));
  assert.equal(s.turnBound,false);
});

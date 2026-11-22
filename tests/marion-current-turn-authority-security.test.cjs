'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const authority = require('../Data/marion/runtime/marionCurrentTurnAuthority.js');
const input = { privateAdminConversation: true, text: 'Review the javascript module for runtime errors', turnId: 'turn-42', sessionId: 'session-42' };
function hash(value) {
  const source = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let h = 0;
  for (let i = 0; i < source.length; i++) {h = ((h << 5) - h) + source.charCodeAt(i);h |= 0;}
  return String(h >>> 0);
}
function valid() {
  const reply = 'Review the JavaScript runtime module and verify the signed code path.';
  const h = hash(reply);
  return { ok: true, final: true, marionFinal: true, canEmit: true, currentTurnBound: true, semanticAuthority: 'marion', reply, text: reply, spokenText: reply, payload: { reply, final: true, marionFinal: true }, finalEnvelope: {
    ok: true, final: true, marionFinal: true, handled: true, source: 'marion', signature: 'MARION_FINAL_AUTHORITY',
    contractVersion: 'nyx.marion.final/1.0', currentTurnBound: true, semanticAuthority: 'marion',
    reply, replySignature: h, marionFinalSignature: `MARION::FINAL::CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24::test::turn-42::${h}`,
    meta: { turnId: 'turn-42' }, completionStatus: { complete: true }, adaptiveTrustVerification: {allowEmit: true}
  }};
}
function blocked(v) { assert.equal(v.marionFinal, false); assert.equal(v.canEmit, false); assert.equal(v.final, false); assert.equal(v.error, 'MARION_FINAL_AUTHORITY_REQUIRED'); }
test('valid certified final stays signed, alias-consistent, and may carry continuity metadata', () => {
  const base=valid(); const v=authority.enforceResult(base,input);
  assert.equal(v.marionFinal,true); assert.equal(v.finalEnvelope.reply,base.finalEnvelope.reply);
  assert.equal(v.finalEnvelope.replySignature,base.finalEnvelope.replySignature);
  assert.equal(v.spokenText,base.reply); assert.equal(v.canEmit,true);
  assert.equal(v.sessionPatch.continuityAnchor.trustedFinal,true);
});
test('unsigned authority flags cannot be promoted', () => {let v=valid();delete v.finalEnvelope.marionFinalSignature;blocked(authority.enforceResult(v,input));});
test('explicit upstream denial stays non-emitting',()=>{let v=valid();v.ok=false;blocked(authority.enforceResult(v,input));});
test('reply mismatch cannot be repaired after signing',()=>{let v=valid();v.payload.reply='different answer text';blocked(authority.enforceResult(v,input));});
test('reply hash mismatch fails closed',()=>{let v=valid();v.finalEnvelope.replySignature='123';blocked(authority.enforceResult(v,input));});
test('turn mismatch fails closed',()=>{let v=valid();v.finalEnvelope.meta.turnId='another';blocked(authority.enforceResult(v,input));});
test('completion block fails closed',()=>{let v=valid();v.finalEnvelope.completionStatus.complete=false;blocked(authority.enforceResult(v,input));});
test('public Nyx context is unchanged',()=>{let v={reply:'public',final:false};assert.equal(authority.enforceResult(v,{text:'Review javascript module'}),v);});
test('state scrub never mints trusted continuity anchor',()=>{
  let result=authority.scrubStateForCurrentTurn({someState:true},input);
  assert.equal(result.continuityAnchor,undefined); assert.equal(result.someState,true);
});
test('missing final authority prevents continuity commit',()=>{let v=authority.enforceResult({ok:true,final:true,reply:'javascript runtime answer'},input);blocked(v);assert.equal(v.sessionPatch,undefined);});
test('untrusted final:true historical memory cannot become a continuation anchor',()=>{
 const q={privateAdminConversation:true,sessionId:'session-42',text:'Go deeper',previousMemory:{lastAcceptedTurn:{sessionId:'session-42',final:true,userText:'Review javascript module for errors',reply:'Check code path'}}};
 assert.equal(authority.extractContinuationAnchor(q),null);
});
test('cross-session accepted anchor cannot be inherited',()=>{
 const q={privateAdminConversation:true,sessionId:'session-42',text:'Go deeper',previousMemory:{lastAcceptedTurn:{sessionId:'another-session',trustedFinal:true,userText:'Review javascript module for errors',reply:'Check code path'}}};
 assert.equal(authority.extractContinuationAnchor(q),null);
});

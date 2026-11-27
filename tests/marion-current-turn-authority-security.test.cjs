'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mod = require(path.resolve(__dirname, '../Data/marion/runtime/marionCurrentTurnAuthority.js'));
const input = { privateAdminConversation: true, sessionId: 'verified-s-1', turnId: 'turn-1', text: 'Inspect the runtime bridge error' };
const reply = 'Inspect the JavaScript runtime bridge and isolate the failing module.';
function certified() {
  return { ok:true,final:true,marionFinal:true,canEmit:true, reply, text:reply,
    finalEnvelope:{ok:true,final:true,marionFinal:true,canEmit:true,currentTurnBound:true,semanticAuthority:'marion',reply,text:reply,
      signature:'canonical-signature-placeholder',replySignature:'canonical-reply-hash-placeholder', meta:{turnId:'turn-1'},
      completionStatus:{complete:true},adaptiveTrustVerification:{allowEmit:true}},
    payload:{reply}, meta:{turnId:'turn-1'} };
}
test('private Composer draft is never promoted', () => {
 const draft={ok:true,reply:'Draft reply',final:false,marionFinal:false,canEmit:false};
 assert.equal(mod.enforceResult(draft,input),draft);
});
test('rejected or retrying result remains non-emitting and unaltered', () => {
 const denied={ok:false,reply:'holding',requiresRetry:true,final:false,canEmit:false,finalEnvelope:{final:false}};
 assert.equal(mod.enforceResult(denied,input),denied);
});
test('public Nyx packet is a no-op', () => {
 const packet={ok:true,reply:'Nyx response'};
 assert.equal(mod.enforceResult(packet,{text:'Inspect JavaScript runtime'}),packet);
});
test('canonical certified reply stays byte-for-byte unchanged', () => {
 const packet=certified(), out=mod.enforceResult(packet,input);
 assert.equal(out.reply,reply);
 assert.equal(out.finalEnvelope,packet.finalEnvelope);
 assert.equal(out.finalEnvelope.signature,packet.finalEnvelope.signature);
 assert.equal(out.finalEnvelope.replySignature,packet.finalEnvelope.replySignature);
 assert.equal(out.final,true);
 assert.equal(out.memoryPatch.continuityAnchor.trustedFinal,true);
});
test('a mismatched turn is not promoted to certified final', () => {
 const packet=certified(); packet.finalEnvelope.meta.turnId='different-turn';
 const out=mod.enforceResult(packet,input);
 assert.equal(out,packet);
});
test('an altered signed reply is not silently repaired', () => {
 const packet=certified();packet.text='Different unauthorized alias';
 const out=mod.enforceResult(packet,input);
 assert.equal(out,packet);
 assert.equal(out.text,'Different unauthorized alias');
});
test('certified reply semantic mismatch becomes non-emitting with no signature', () => {
 const packet=certified();
 const expected={...input,text:'Good morning'};
 const out=mod.enforceResult(packet,expected);
 assert.equal(out.ok,false);
 assert.equal(out.final,false);
 assert.equal(out.canEmit,false);
 assert.equal(out.finalEnvelope,undefined);
 assert.equal(out.reply,'');
});
test('scrubbing state cannot create accepted trusted final anchor', () => {
 const state={domain:'law',lastTopic:'Old topic',oldField:4};
 const out=mod.scrubStateForCurrentTurn(state,input);
 assert.equal(out.continuityAnchor,undefined);
 assert.equal(out.trustedFinal,undefined);
 assert.equal(out.currentTurnAuthorityVersion,mod.VERSION);
});
test('unverified older session cannot become continuation authority', () => {
 const follow={privateAdminConversation:true,text:'Go deeper',sessionId:'verified-s-1',previousMemory:{lastAcceptedTurn:{
     userText:'Repair the JavaScript runtime bridge',sessionId:'other-session',trustedFinal:true,domain:'technical',final:true}}};
 assert.equal(mod.extractContinuationAnchor(follow),null);
});
test('bare final:true historical metadata is not accepted as continuity authority', () => {
 const follow={privateAdminConversation:true,text:'Go deeper',sessionId:'verified-s-1',previousMemory:{lastAcceptedTurn:{
     userText:'Repair the JavaScript runtime bridge',sessionId:'verified-s-1',final:true,domain:'technical'}}};
 assert.equal(mod.extractContinuationAnchor(follow),null);
});
test('rejected router result remains rejected without route-success promotion', () => {
 const rejected={ok:false,routeFailClosed:true,blocked:true,reason:'route_denied'};
 assert.equal(mod.enforceRouterResult(rejected,input),rejected);
});
test('nonfinal router result cannot acquire ok from current-turn classifier', () => {
 const draft={routing:{domain:'law'}};
 const out=mod.enforceRouterResult(draft,input);
 assert.equal(out.ok,undefined);
 assert.equal(out.routing.domain,'technical');
});

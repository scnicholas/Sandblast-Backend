'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const runtimePath = path.resolve(__dirname, '../Data/marion/runtime/marionPrivateRuntimeAdapter.js');
const bridgePath = path.resolve(__dirname, '../Data/marion/runtime/marionBridge.js');
const PROMPT = 'Should Sandblast build or buy streaming infrastructure? Compare cost, control, scalability, and migration risk and recommend one strategy.';
function withBridge(mock, fn) {
  const previous = require.cache[bridgePath];
  require.cache[bridgePath] = { id: bridgePath, filename: bridgePath, loaded: true, exports: mock };
  delete require.cache[runtimePath];
  return Promise.resolve().then(() => fn(require(runtimePath))).finally(() => {
    delete require.cache[runtimePath];
    if (previous) require.cache[bridgePath] = previous;
    else delete require.cache[bridgePath];
  });
}
const VERIFIED = { adminVerified: true, sessionVerified: true, sessionId: 'verified-owner-test-123' };
test('rejects client-supplied admin flags without server verification', async () => {
  let called = false;
  await withBridge({handleMarionAdminConversation(){called=true;return {reply:'should not run'};}}, async a => {
    const r = await a.invokePrivateRuntime({prompt:PROMPT, adminVerified:true, verified:true, sessionVerified:true, passwordFreeTestChat:true});
    assert.equal(r.statusCode,401);assert.equal(called,false);
  });
});
test('routes through Neon-capable conversation handler, not unwrapped processWithMarion', async () => {
  let legacyCalled=false, neonCalled=false, ticketSeen=false;
  await withBridge({
    VERSION:'neon-mock',
    processWithMarion(){legacyCalled=true;return {reply:'What would you like me to focus on?'};},
    handleMarionAdminConversation(input){neonCalled=true; ticketSeen=input.__marionNeonPrivateTicket==='test-one-time-ticket';return {reply:'Buy a hosted streaming core now for predictable costs, retain control of programme and advertising data, and migrate components gradually as audience load grows.', domain:'business'};}
  }, async a=>{
    const r=await a.invokePrivateRuntime({prompt:PROMPT,__marionNeonPrivateTicket:'test-one-time-ticket',sessionId:'verified-owner-test-123'}, VERIFIED);
    assert.equal(neonCalled,true);assert.equal(legacyCalled,false);assert.equal(ticketSeen,true);
    assert.equal(r.statusCode,200);assert.match(r.reply,/Buy a hosted streaming core/);
    assert.equal(r.result.finalEnvelope.reply,r.reply);
  });
});
test('generic business answer is not passed as a successful strategy recommendation', async()=>{
  await withBridge({handleMarionAdminConversation(){return {reply:'What would you like me to focus on? Share context and constraints.',domain:'business'};}}, async a=>{
    const r=await a.invokePrivateRuntime({prompt:PROMPT,sessionId:'verified-owner-test-123'},VERIFIED);
    assert.doesNotMatch(r.reply,/^What would you like me to focus on/i);
    assert.match(r.reply,/did not produce a verified, relevant answer/i);
    assert.equal(r.degraded,true);
  });
});
test('Neon private handler is present in current shipped bridge',()=>{
  const bridge=require(bridgePath);
  assert.equal(typeof bridge.handleMarionAdminConversation,'function');
  assert.equal(typeof bridge.configureMarionNeonAdvisory,'function');
});
test('rejects cross-session continuity impersonation', async()=>{
  await withBridge({handleMarionAdminConversation(){throw new Error('should not run')}},async a=>{
    const r=await a.invokePrivateRuntime({prompt:PROMPT,sessionId:'another-private-session'},VERIFIED);
    assert.equal(r.statusCode,403);
  });
});

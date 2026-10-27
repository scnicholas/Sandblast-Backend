'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const src = path.resolve(__dirname, '../Data/marion/runtime/marionPrivateRuntimeAdapter.js');
function fixture(reply, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marion-adapter-contract-'));
  fs.copyFileSync(src, path.join(dir, 'marionPrivateRuntimeAdapter.js'));
  fs.writeFileSync(path.join(dir, 'marionBridge.js'), `module.exports = {VERSION:'fixture', handleMarionAdminConversation: async (input, context) => { global.__marionTestInput = input; global.__marionTestContext = context; ${options.throws ? 'throw new Error("secret-token-should-not-leak");' : 'return ' + JSON.stringify({reply, primaryDomain:options.domain||'business'}) + ';'} } };`);
  const adapter = require(path.join(dir, 'marionPrivateRuntimeAdapter.js'));
  const cleanup = () => { delete global.__marionTestInput; delete global.__marionTestContext; fs.rmSync(dir,{recursive:true,force:true}); };
  return {adapter, cleanup};
}
const prompt = 'Marion, evaluate whether Sandblast should build or buy its streaming infrastructure. Compare cost and migration risk.';
const auth = {adminVerified:true,sessionVerified:true,sessionId:'owner-session-123'};

test('rejects request-body-only verification before bridge', async () => {
  const {adapter,cleanup} = fixture('Buy managed streaming for cost predictability and migrate gradually.');
  try { const r=await adapter.invokePrivateRuntime({prompt,adminVerified:true,verified:true,sessionVerified:true,sessionId:'owner-session-123'},{}); assert.equal(r.statusCode,401); assert.equal(global.__marionTestInput,undefined); } finally{cleanup();}
});
test('rejects mismatched server session', async () => {
  const {adapter,cleanup} = fixture('Buy managed streaming for cost predictability and migrate gradually.');
  try { const r=await adapter.invokePrivateRuntime({prompt,sessionId:'different-session'},auth); assert.equal(r.statusCode,403); } finally{cleanup();}
});
test('validates server flags and completes substantive response with aliases aligned', async () => {
  const reply='For Sandblast streaming infrastructure, buy a managed streaming service initially: costs are predictable, migration risk is lower, and scalability is available. Retain control over content and subscriber data.';
  const {adapter,cleanup} = fixture(reply);
  try {
    const r=await adapter.invokePrivateRuntime({prompt,adminVerified:false,verified:false,sessionId:'owner-session-123'},auth);
    assert.equal(r.ok,true); assert.equal(r.statusCode,200);
    assert.equal(r.authoritativeReply,r.visibleReply); assert.equal(r.finalReply,r.directReply);
    assert.equal(global.__marionTestInput.verified,true); assert.equal(global.__marionTestInput.sessionVerified,true);
    assert.equal(global.__marionTestInput.passwordFreeTestChat,false);
  } finally {cleanup();}
});
test('generic reply never becomes an accepted final', async () => {
  const {adapter,cleanup} = fixture('What would you like me to focus on? Share relevant context.');
  try { const r=await adapter.invokePrivateRuntime({prompt,sessionId:'owner-session-123'},auth); assert.equal(r.ok,false); assert.equal(r.statusCode,502); assert.equal(r.reason,'generic_bridge_reply'); assert.equal(r.reply,''); } finally {cleanup();}
});
test('bridge exceptions do not leak raw error text', async () => {
  const {adapter,cleanup} = fixture('',{throws:true});
  try {const r=await adapter.invokePrivateRuntime({prompt,sessionId:'owner-session-123'},auth); assert.equal(r.ok,false); assert.equal(r.reason,'canonical_bridge_exception'); assert.ok(!JSON.stringify(r).includes('secret-token-should-not-leak'));} finally{cleanup();}
});

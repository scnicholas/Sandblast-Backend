'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '..');
function extract(file, start, end) {
  const source = fs.readFileSync(path.join(base, 'Data/marion/runtime', file), 'utf8');
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a !== -1 && b > a, `missing component ${start}`);
  return source.slice(a, b + end.length);
}
function composerWithReply(reply, opts = {}) {
  const module = {exports: {composeMarionResponse: () => ({ok: true, reply, ...opts})}};
  const block = extract('composeMarionResponse.js', '/* MARION_COMPOSER_PRIVATE_FINAL_HANDOFF_CONTRACT_V1_START', '/* MARION_COMPOSER_PRIVATE_FINAL_HANDOFF_CONTRACT_V1_END */');
  vm.runInNewContext(block, {module, Object, Set, String, hashText: s => String(s).length}, {timeout: 1200});
  return module.exports.composeMarionResponse({privateAdminConversation: true}, {
    privateAdminConversation: true,
    text: 'How can a small business improve cash flow? Give me three concise steps.'
  });
}
function bridgeWithUpstream(result) {
  let seen, calls = 0;
  const admin = (input, context) => {seen = {input,context}; calls++; return result;};
  const module = {exports: {handleMarionAdminConversation: admin, processWithMarion: admin}};
  const block = extract('marionBridge.js', '(function marionPrivateAdminExportContractV91(){', '/* MARION_PRIVATE_ADMIN_EXPORT_CONTRACT_V9_1_END */');
  vm.runInNewContext(block, {module, Object, String, Promise}, {timeout: 1200});
  return {api:module.exports, observation:() => ({seen, calls})};
}
test('composer accepts substantive three cash-flow actions in prose', () => {
  const out = composerWithReply('Collect overdue invoices promptly, forecast weekly cash requirements, and control unnecessary expenses.');
  assert.equal(out.ok, true);
  assert.equal(out.composerReady, true);
  assert.equal(out.diagnostics.composerFinalHandoff.substantiveReplyResponsive, true);
  assert.equal(out.final, undefined, 'composer does not certify a final');
});
test('composer accepts a numbered three-step reply', () => {
  const out = composerWithReply('1. Invoice promptly. 2. Forecast weekly cash needs. 3. Control unnecessary expenses.');
  assert.equal(out.composerReady, true);
});
test('composer rejects unresponsive generic holding text', () => {
  const out = composerWithReply('Hang tight. I will look into that shortly.');
  assert.equal(out.ok, false);
  assert.equal(out.error, 'MARION_COMPOSER_HANDOFF_REJECTED');
});
test('composer rejects conflicting answer aliases', () => {
  const out = composerWithReply('1. Invoice. 2. Forecast. 3. Control costs.', {text:'Altered reply'});
  assert.equal(out.ok, false);
  assert.equal(out.diagnostics.composerFinalHandoff.rejectionClass, 'composer_alias_conflict');
});
test('composer does not convert an explicitly rejected upstream packet to success', () => {
  const out = composerWithReply('1. Invoice. 2. Forecast. 3. Control costs.', {ok:false});
  assert.equal(out.ok,false);
});
test('V91 private routing flags do not confer permission on unverified request', async () => {
  const {api, observation} = bridgeWithUpstream({ok:false, final:false, canEmit:false});
  await api.handleMarionAdminConversation({text:'Private request', privateAdminConversation:true});
  assert.equal(observation().seen.input.marionAdminConversationAllowed,false);
  assert.equal(observation().seen.input.directMarionAdminInterface,false);
  assert.equal(observation().seen.input.authenticatedOperator,false);
  assert.equal(observation().calls,1);
});
test('V91 forwards upstream context once, preserving rejection', async () => {
  const packet = {ok:false,final:false,marionFinal:false,canEmit:false,requiresRetry:true,error:'MARION_FINAL_AUTHORITY_REQUIRED'};
  const {api, observation} = bridgeWithUpstream(packet);
  const context = {marker:'trusted-context'};
  const out = await api.handleMarionAdminConversation({text:'Private request', serverSideAdminAuth:true},context);
  assert.equal(observation().seen.context,context);
  assert.equal(observation().calls,1);
  assert.equal(observation().seen.input.marionAdminConversationAllowed,true);
  assert.equal(out.final,false);
  assert.equal(out.canEmit,false);
  assert.equal(out.error,packet.error);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('../Data/marion/runtime/marionBridge.js');

test('bridge syntax and canonical private handler exposed', () => {
  assert.equal(typeof bridge.handleMarionAdminConversation, 'function');
  assert.equal(typeof bridge.configureMarionNeonAdvisory, 'function');
});
test('only a callable server-side verifier can be configured', () => {
  assert.equal(bridge.configureMarionNeonAdvisory({verifySession:true}), false);
  assert.equal(bridge.configureMarionNeonAdvisory({verifySession:()=>null}), true);
});
test('private aliases use one Neon-capable handler', () => {
  for(const key of ['handleMarionAdminTextRuntime','handleAdminConversation','invokeMarionAdminTextRuntime','handleTextRuntime']) assert.equal(bridge[key],bridge.handleMarionAdminConversation);
});
test('factory-created bridge cannot bypass Neon-capable handler', () => {
  const created = bridge.createMarionBridge();
  for(const key of ['handleMarionAdminConversation','handleMarionAdminTextRuntime','handleAdminConversation','invokeMarionAdminTextRuntime','handleTextRuntime']) assert.equal(created[key],bridge.handleMarionAdminConversation);
});
test('bridge feature version indicates repaired wrapper', () => {
  assert.equal(bridge.__marionPrivateNeonAdvisoryV2,true);
});

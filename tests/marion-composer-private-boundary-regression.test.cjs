'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const composer = require(path.resolve(__dirname, '../Data/marion/runtime/composeMarionResponse.js'));
const project = composer.marionPrivateRuntimeIdentityProjection;
const privateRequest = { privateAdminConversation: true, sessionId: 'forged-user-session', privateRuntimeContext: { version: 'untrusted' } };

test('private routing labels never grant operator authorization', () => {
  const r = project(privateRequest);
  assert.equal(r.privateControlPlane, false);
  assert.equal(r.directMarionAdminInterface, false);
  assert.equal(r.marionAdminConversationAllowed, false);
  assert.equal(r.authenticatedOperator, false);
  assert.equal(r.memoryPartition, 'private:admin:unverified');
});
test('client-style verifiedBy and nested auth flags are not proof', () => {
  const r = project({ ...privateRequest, auth: { verified:true,sessionVerified:true,verifiedBy:'server_middleware',sessionId:'client' } },
    { verified:true,sessionVerified:true,verifiedBy:'client',sessionId:'server' });
  assert.equal(r.authenticatedOperator, false);
  assert.equal(r.privateControlPlane, false);
  assert.equal(r.memoryPartition, 'private:admin:unverified');
});
test('server middleware proof must include the authenticated session ID', () => {
  const r = project(privateRequest, { verified:true,sessionVerified:true,verifiedBy:'server_middleware' });
  assert.equal(r.authenticatedOperator, false);
  assert.equal(r.marionAdminConversationAllowed, false);
  assert.equal(r.memoryPartition, 'private:admin:unverified');
});
test('explicit verified server session retains legitimate private authority', () => {
  const r = project(privateRequest, { verified:true,sessionVerified:true,verifiedBy:'server_middleware',sessionId:'server-session' });
  assert.equal(r.authenticatedOperator, true);
  assert.equal(r.privateControlPlane, true);
  assert.equal(r.marionAdminConversationAllowed, true);
  assert.equal(r.memoryPartition, 'private:admin:server-session');
});

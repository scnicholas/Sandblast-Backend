'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root,'Data/marion/runtime/MarionVoiceGateway.js'), 'utf8');
const start = source.indexOf('(function marionSelfLearningAdminCaptureV1()');
const end = source.indexOf('/* MARION_SELF_LEARNING_ADMIN_CAPTURE_V1_END */', start);
assert.ok(start >= 0 && end > start);
const snippet = source.slice(start, end);
function load(integration) {
 const exports = { handleMarionAdminConversation: async () => ({ok:true}) };
 const context = { module:{exports}, require(name){ if(name === './learning/MarionLearningIntegration.js') {if(!integration) throw Object.assign(new Error('missing'),{code:'MODULE_NOT_FOUND'});return integration;} throw Object.assign(new Error('missing'),{code:'MODULE_NOT_FOUND'}); }, console };
 vm.runInNewContext(snippet,context);
 return exports;
}
test('hook is present even if optional integration is missing, and fails closed', () => {
 const gateway=load(null);
 assert.equal(typeof gateway.registerMarionLearningRuntime,'function');
 assert.throws(()=>gateway.registerMarionLearningRuntime({}), /learning_integration_registration_unavailable/);
 assert.equal(gateway.getMarionLearningIntegrationStatus().ready,false);
});
test('valid integration receives runtime exactly once', () => {
 let calls=0; const runtime={};
 const gateway=load({registerRuntime(r){assert.equal(r,runtime);calls++;return {ok:true};},status(){return {ready:true};},captureAcceptedAdminFinal:async()=>{},isAcceptedMarionFinal:()=>true});
 assert.equal(gateway.registerMarionLearningRuntime(runtime).ok,true);
 assert.equal(calls,1);
 assert.equal(gateway.getMarionLearningIntegrationStatus().ready,true);
});
test('backend setup rejects negative registration, does not publish false success', () => {
 const body=fs.readFileSync(path.join(root,'Data/marion/runtime/learning/MarionLearningBackendSetup.js'),'utf8');
 assert.match(body,/gateway_learning_registration_rejected/);
 assert.match(body,/typeof gatewayModule\.registerMarionLearningRuntime !== "function"/);
});
test('offline composer versions module uses existing two-version registry contract', () => {
 const body=fs.readFileSync(path.join(root,'Data/marion/runtime/learning/MarionLearningOfflineComposerVersions.js'),'utf8');
 assert.match(body,/function registerMarionLearningOfflineComposerVersions/);
 assert.match(body,/versionRegistry\.set\(baselineVersion/);
 assert.match(body,/versionRegistry\.set\(candidateVersion/);
});

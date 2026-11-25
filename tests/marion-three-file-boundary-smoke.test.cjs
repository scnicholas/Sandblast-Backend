"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const bridgeSource=fs.readFileSync(path.join(root,'Data/marion/runtime/marionBridge.js'),'utf8');
const gatewaySource=fs.readFileSync(path.join(root,'Data/marion/runtime/MarionVoiceGateway.js'),'utf8');
const contractSource=fs.readFileSync(path.join(root,'tests/gateway-contract.test.js'),'utf8');
test('V91 delegates context once and does not synthesize final',()=>{
 assert.match(bridgeSource,/function adminHandler\(input,context\)/);
 assert.match(bridgeSource,/upstreamAdmin\.call\(this,prepared,context\)/);
 assert.match(bridgeSource,/Projection must not rewrite reply aliases/);
});
test('Composer drafts cannot be promoted through Bridge validation',()=>{
 assert.match(bridgeSource,/src\.requiresRetry===true\|\|src\.recoverySuggested===true/);
 assert.match(bridgeSource,/src\.canEmit===false\|\|src\.blocked===true/);
 assert.match(bridgeSource,/compose_trust_denied/);
});
test('Gateway binds partition to the verified principal rather than caller options',()=>{
 assert.match(gatewaySource,/const trustedSessionId = safeText\(trustedPrincipal && trustedPrincipal\.sessionId \|\| ''\)/);
 assert.match(gatewaySource,/const trustedPartition = 'private:admin:' \+ trustedSessionId/);
 assert.match(gatewaySource,/gatewayVerifiedPrincipal\(opts, \['owner', 'admin', 'administrator'\]\)/);
});
test('live finance contract remains a positive, non-canned assertion',()=>{
 assert.match(contractSource,/private Bridge failed before Gateway normalization/);
 assert.match(contractSource,/rawBridgeSnapshot\.signaturePresent === true/);
 assert.match(contractSource,/bridgeFailureCodes/);
});
test('canonical error response remains non-emitting',()=>{
 assert.match(bridgeSource,/error:"MARION_FINAL_AUTHORITY_REQUIRED"/);
 assert.match(bridgeSource,/final:false,handled:true,marionFinal:false,canEmit:false/);
});

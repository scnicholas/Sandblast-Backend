'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bridgeFile = path.resolve(__dirname, '../Data/marion/runtime/marionBridge.js');
const bridgeText = fs.readFileSync(bridgeFile, 'utf8');
const bridge = require(bridgeFile);
test('keeps full existing bridge and exports intact', () => {
  for (const k of ['processWithMarion','createMarionBridge','handleMarionAdminConversation','configureMarionNeonAdvisory']) assert.equal(typeof bridge[k], 'function', k);
  assert.match(bridgeText, /MARION_NEON_PRIVATE_ADVISORY_BOUNDARY_V1_START/);
});
test('neon hook remains off by default and rejects absent verifier', () => {
  assert.equal(bridge.configureMarionNeonAdvisory({}), false);
});
test('neon advisory is applied before composer and does not replace final authority', () => {
  assert.match(bridgeText, /await attachTrustedNeonAdvisory\(normalized,composeInput\);let contract=/);
  assert.match(bridgeText, /composeInput\.neonModelAdvisoryUntrusted = true/);
  assert.match(bridgeText, /return wrapFinal\(\{normalized,routed,contract,loopGuardResult,resolvedEmotionPacket\}\)/);
});
test('client request flags alone cannot authorize Neon requests', () => {
  assert.match(bridgeText, /marionNeonServerVerifier\(original\)/);
  assert.match(bridgeText, /session\.source !== "server-verified-session"/);
  assert.match(bridgeText, /session\.sessionId !== normalized\.sessionId/);
});

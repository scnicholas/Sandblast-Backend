/**
 * Tests: MarionRawInputEnvelope
 */

'use strict';

const assert = require('assert');
const { createRawInputEnvelope } = require('../../Data/marion/runtime/MarionRawInputEnvelope');

const envelope = createRawInputEnvelope('Hello Marion', {
  source: 'chat',
  sessionId: 'test-session'
});

assert.strictEqual(envelope.rawInput, 'Hello Marion');
assert.strictEqual(envelope.preservedRawInput, 'Hello Marion');
assert.strictEqual(envelope.authority, 'MARION');
assert.strictEqual(envelope.marionGate.rawInputPreserved, true);
assert.strictEqual(envelope.marionGate.mayProceedToLanguageDetection, true);

const empty = createRawInputEnvelope('   ');
assert.strictEqual(empty.marionGate.mayProceedToLanguageDetection, false);
assert.strictEqual(empty.marionGate.decision, 'reject_empty_input');

console.log('PASS marion-raw-input-envelope.test.js');

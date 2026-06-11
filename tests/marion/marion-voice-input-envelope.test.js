'use strict';

const assert = require('assert');

const {
  createVoiceInputEnvelope,
  isVoiceInputEnvelope,
  detectIntentHint,
  cleanTranscript,
  clampConfidence
} = require('../../Data/marion/runtime/MarionVoiceInputEnvelope');

function run() {
  assert.strictEqual(cleanTranscript('  Vera,   give me status.  '), 'Vera, give me status.');
  assert.strictEqual(clampConfidence(1.5), 1);
  assert.strictEqual(clampConfidence(-0.2), 0);
  assert.strictEqual(clampConfidence('bad'), null);

  assert.strictEqual(detectIntentHint('delete the deployment'), 'command');
  assert.strictEqual(detectIntentHint('give me a status update'), 'status');
  assert.strictEqual(detectIntentHint('explain cash flow'), 'inquiry');
  assert.strictEqual(detectIntentHint(''), 'empty');

  const envelope = createVoiceInputEnvelope({
    transcript: '  Vera, give me a Marion status update. ',
    confidence: 0.93,
    locale: 'en-CA',
    speakerHint: 'Mac',
    sessionId: 'voice-test-session',
    requestId: 'voice-test-request',
    provider: 'browser-native'
  });

  assert.strictEqual(envelope.ok, true);
  assert.strictEqual(envelope.source, 'voice');
  assert.strictEqual(envelope.inputChannel, 'voice');
  assert.strictEqual(envelope.transcript, 'Vera, give me a Marion status update.');
  assert.strictEqual(envelope.confidence, 0.93);
  assert.strictEqual(envelope.locale, 'en-CA');
  assert.strictEqual(envelope.userIntentHint, 'status');
  assert.strictEqual(envelope.authorizationState, 'unchecked');
  assert.strictEqual(envelope.speakerHint, 'Mac');
  assert.strictEqual(envelope.rawMeta.audioStored, false);
  assert.deepStrictEqual(envelope.warnings, []);
  assert.strictEqual(isVoiceInputEnvelope(envelope), true);

  const empty = createVoiceInputEnvelope({ transcript: '   ' });

  assert.strictEqual(empty.ok, false);
  assert.strictEqual(empty.userIntentHint, 'empty');
  assert.ok(empty.warnings.includes('EMPTY_TRANSCRIPT'));
  assert.strictEqual(isVoiceInputEnvelope(empty), true);
}

run();

console.log('PASS marion-voice-input-envelope');

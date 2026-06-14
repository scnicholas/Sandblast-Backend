'use strict';

const assert = require('assert');
const stabilizer = require('../../Data/marion/runtime/NyxVoiceDeliveryStabilizer');

function finalResponse(reply) {
  return {
    ok: true,
    final: true,
    marionFinal: true,
    finalEnvelope: {
      contractVersion: 'nyx.marion.final/1.0',
      signature: 'MARION_FINAL_AUTHORITY',
      authority: 'marionFinalEnvelope',
      final: true,
      marionFinal: true,
      reply,
      spokenText: reply
    }
  };
}

function envelope(extra) {
  return Object.assign({
    sessionId: 'test-session',
    requestId: 'test-request',
    transcript: 'give me the status',
    authorizationState: 'authorized',
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true
  }, extra || {});
}

function policy(extra) {
  return Object.assign({
    speakAllowed: true,
    voiceMode: 'full',
    adminVoiceDeliveryAllowed: true
  }, extra || {});
}

stabilizer.resetNyxVoiceDeliveryState();
let result = stabilizer.stabilizeNyxVoiceDelivery({
  response: finalResponse('Protected voice lane is stable.'),
  voiceEnvelope: envelope(),
  outputPolicy: policy()
});
assert.strictEqual(result.speakAllowed, true);
assert.strictEqual(result.spokenText, 'Protected voice lane is stable.');
assert.strictEqual(result.finalEnvelopeOnly, true);
assert.strictEqual(result.finalApproved, true);

stabilizer.resetNyxVoiceDeliveryState();
result = stabilizer.stabilizeNyxVoiceDelivery({
  response: { ok: true, reply: 'Loose non-final reply.' },
  voiceEnvelope: envelope(),
  outputPolicy: policy(),
  candidateReply: 'Loose non-final reply.'
});
assert.strictEqual(result.speakAllowed, false);
assert.strictEqual(result.reason, 'MARION_FINAL_ENVELOPE_REQUIRED');
assert.strictEqual(result.displayReply, 'Loose non-final reply.');

stabilizer.resetNyxVoiceDeliveryState();
result = stabilizer.stabilizeNyxVoiceDelivery({
  response: finalResponse('Repeat-safe final.'),
  voiceEnvelope: envelope({ sessionId: 'dup-session' }),
  outputPolicy: policy()
});
assert.strictEqual(result.speakAllowed, true);
result = stabilizer.stabilizeNyxVoiceDelivery({
  response: finalResponse('Repeat-safe final.'),
  voiceEnvelope: envelope({ sessionId: 'dup-session' }),
  outputPolicy: policy()
});
assert.strictEqual(result.speakAllowed, false);
assert.strictEqual(result.duplicateSuppressed, true);
assert.strictEqual(result.reason, 'VOICE_DOUBLE_FIRE_SUPPRESSED');

stabilizer.resetNyxVoiceDeliveryState();
result = stabilizer.stabilizeNyxVoiceDelivery({
  response: finalResponse('give me the status'),
  voiceEnvelope: envelope({ transcript: 'give me the status' }),
  outputPolicy: policy()
});
assert.strictEqual(result.speakAllowed, false);
assert.strictEqual(result.echoSuppressed, true);
assert.strictEqual(result.reason, 'VOICE_ROUTE_ECHO_SUPPRESSED');

stabilizer.resetNyxVoiceDeliveryState();
result = stabilizer.stabilizeNyxVoiceDelivery({
  response: finalResponse('Authorized final.'),
  voiceEnvelope: envelope({ authorizationState: 'blocked', adminVoiceVerified: false, adminVoiceDeliveryAllowed: false }),
  outputPolicy: policy({ adminVoiceDeliveryAllowed: false })
});
assert.strictEqual(result.speakAllowed, false);
assert.strictEqual(result.reason, 'ADMIN_ONLY_VOICE_DELIVERY_REQUIRED');

console.log('PASS nyx-voice-delivery-stabilizer.test.js');

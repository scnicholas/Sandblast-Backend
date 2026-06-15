'use strict';

const assert = require('assert');
const path = require('path');

const stabilizer = require(path.join(__dirname, '..', '..', 'Data', 'marion', 'runtime', 'NyxVoiceDeliveryStabilizer.js'));
const policy = require(path.join(__dirname, '..', '..', 'Data', 'marion', 'runtime', 'MarionVoiceOutputPolicy.js'));

function run() {
  stabilizer.resetNyxVoiceDeliveryState();

  const envelope = {
    authorizationState: 'authorized',
    adminVoiceVerified: true,
    adminVoiceDeliveryAllowed: true,
    transcript: 'Nyx, give me a protected voice status summary.',
    originalTranscript: 'Nyx, give me a protected voice status summary.',
    userIntentHint: 'status',
    sessionId: 'phase1-speakable-final-test'
  };

  const echoResponse = {
    ok: true,
    authority: 'Marion',
    reply: 'Nyx, give me a protected voice status summary.',
    voice: {
      speakAllowed: true,
      voiceMode: 'full',
      spokenText: 'Nyx, give me a protected voice status summary.'
    }
  };

  const outputPolicy = {
    speakAllowed: true,
    voiceMode: 'full',
    reason: 'SPEAKABLE_RESPONSE',
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: true
  };

  const safeStatusReply = 'Nyx is connected through Marion. Marion remains the final response authority, admin voice delivery is authorized, and raw audio is not being stored.';
  const result = stabilizer.stabilizeNyxVoiceDelivery({
    response: echoResponse,
    voiceEnvelope: envelope,
    outputPolicy,
    candidateReply: safeStatusReply,
    allowCandidateAsFinal: true,
    candidateFinalSource: 'gateway_protected_voice_status'
  });

  assert.strictEqual(result.adminVoiceDeliveryAllowed, true, 'admin voice delivery should stay allowed');
  assert.strictEqual(result.extractedFinalEchoSuppressed, true, 'echo-like extracted final should be identified');
  assert.strictEqual(result.finalApproved, true, 'protected status candidate should become final-approved');
  assert.strictEqual(result.echoSuppressed, false, 'safe status final should not be muted as echo');
  assert.strictEqual(result.speakAllowed, true, 'safe status final should be speakable');
  assert.strictEqual(result.spokenText, safeStatusReply, 'spokenText should be the clean protected status final');
  assert.strictEqual(result.noRawAudioStored, true, 'raw audio must remain unstored');

  const policyResult = policy.evaluateVoiceOutputPolicy({ reply: safeStatusReply }, {
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: true
  });
  assert.strictEqual(policyResult.speakAllowed, true, 'safe protected status text should pass output policy');

  stabilizer.resetNyxVoiceDeliveryState();
  const blocked = stabilizer.stabilizeNyxVoiceDelivery({
    response: echoResponse,
    voiceEnvelope: Object.assign({}, envelope, { adminVoiceVerified: false, adminVoiceDeliveryAllowed: false, authorizationState: 'blocked', sessionId: 'phase1-blocked-test' }),
    outputPolicy: Object.assign({}, outputPolicy, { adminVoiceDeliveryAllowed: false }),
    candidateReply: safeStatusReply,
    allowCandidateAsFinal: true,
    candidateFinalSource: 'gateway_protected_voice_status'
  });
  assert.strictEqual(blocked.speakAllowed, false, 'without admin proof, spoken output must remain blocked');
  assert.strictEqual(blocked.reason, 'ADMIN_ONLY_VOICE_DELIVERY_REQUIRED', 'blocked reason must preserve admin-only hardlock');

  console.log('PASS nyx-voice-speakable-final-output.test.js');
}

run();

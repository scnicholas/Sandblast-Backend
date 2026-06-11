'use strict';

const assert = require('assert');

const {
  evaluateVoiceAuthorization,
  applyVoiceAuthorization,
  isRestrictedTranscript,
  isSpeakerAuthorized
} = require('../../Data/marion/runtime/MarionVoiceAuthorizationGate');

function run() {
  assert.strictEqual(isSpeakerAuthorized('Mac'), true);
  assert.strictEqual(isSpeakerAuthorized('Sean Nicholas'), true);
  assert.strictEqual(isSpeakerAuthorized('Unknown Person'), false);

  assert.strictEqual(isRestrictedTranscript('delete deployment files now'), true);
  assert.strictEqual(isRestrictedTranscript('give me a status update'), false);

  const authorizedStatus = evaluateVoiceAuthorization({
    transcript: 'Vera, give me a Marion status update.',
    userIntentHint: 'status',
    speakerHint: 'Mac'
  });

  assert.strictEqual(authorizedStatus.allowed, true);
  assert.strictEqual(authorizedStatus.authorizationState, 'authorized');
  assert.strictEqual(authorizedStatus.reason, 'AUTHORIZED_SPEAKER');

  const blockedCommand = evaluateVoiceAuthorization({
    transcript: 'Delete the deployment files and publish now.',
    userIntentHint: 'command',
    speakerHint: ''
  });

  assert.strictEqual(blockedCommand.allowed, false);
  assert.strictEqual(blockedCommand.authorizationState, 'blocked');
  assert.strictEqual(blockedCommand.reason, 'RESTRICTED_VOICE_COMMAND_REQUIRES_AUTHORIZATION');

  const limitedConversation = evaluateVoiceAuthorization({
    transcript: 'What is cash flow?',
    userIntentHint: 'inquiry',
    speakerHint: ''
  });

  assert.strictEqual(limitedConversation.allowed, true);
  assert.strictEqual(limitedConversation.authorizationState, 'limited');
  assert.strictEqual(limitedConversation.reason, 'LIMITED_CONVERSATIONAL_ACCESS');

  const applied = applyVoiceAuthorization({
    transcript: 'Run the Marion voice route status check.',
    userIntentHint: 'command',
    speakerHint: 'Mac'
  });

  assert.strictEqual(applied.authorization.allowed, true);
  assert.strictEqual(applied.envelope.authorizationState, 'authorized');
  assert.strictEqual(applied.envelope.authorization.reason, 'AUTHORIZED_SPEAKER');

  const empty = evaluateVoiceAuthorization({
    transcript: '',
    userIntentHint: 'empty',
    speakerHint: 'Mac'
  });

  assert.strictEqual(empty.allowed, false);
  assert.strictEqual(empty.reason, 'EMPTY_TRANSCRIPT');
}

run();

console.log('PASS marion-voice-authorization-gate');

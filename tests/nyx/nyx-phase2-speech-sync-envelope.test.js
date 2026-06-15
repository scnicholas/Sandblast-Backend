'use strict';

const assert = require('assert');

const speechSync = require('../../Data/marion/runtime/NyxSpeechSyncEnvelope');
const visemeMapper = require('../../Data/marion/runtime/NyxVisemeMapper');
const timingAdapter = require('../../Data/marion/runtime/NyxSpeechTimingAdapter');
const avatarState = require('../../Data/marion/runtime/NyxAvatarSpeechState');
const transcriptNormalizer = require('../../Data/marion/runtime/MarionVoiceTranscriptNormalizer');
const outputPolicy = require('../../Data/marion/runtime/MarionVoiceOutputPolicy');

const spokenText = 'Nyx is connected through Marion. Marion remains the final response authority, admin voice delivery is authorized, and raw audio is not being stored.';

const envelope = speechSync.buildSpeechSyncEnvelope({
  spokenText,
  speakAllowed: true,
  voiceMode: 'full',
  finalApproved: true,
  adminVoiceDeliveryAllowed: true,
  voiceEnvelope: {
    locale: 'en-CA',
    authorizationState: 'authorized',
    adminVoiceDeliveryAllowed: true
  }
});

assert.strictEqual(envelope.enabled, true, 'speech sync should be enabled for an admin-approved spoken final');
assert.strictEqual(envelope.audioStored, false, 'speech sync must not store audio');
assert.strictEqual(envelope.transcriptOnly, true, 'speech sync must remain transcript-only');
assert.ok(envelope.estimatedDurationMs > 0, 'duration should be estimated');
assert.ok(Array.isArray(envelope.visemes), 'visemes should be returned');
assert.ok(envelope.visemes.length > 0, 'viseme sequence should not be empty');
assert.strictEqual(envelope.avatarSpeechState, 'voice_delivery_ready', 'avatar state should be prepared');

const mapped = visemeMapper.mapTextToVisemes('Marion protects Nyx voice.');
assert.ok(mapped.count > 0, 'viseme mapper should create cues');

const timing = timingAdapter.buildSpeechTiming('Marion protects Nyx voice.');
assert.ok(timing.estimatedDurationMs > 0, 'timing adapter should estimate duration');

const state = avatarState.buildAvatarSpeechState({
  speakAllowed: true,
  spokenText: 'Marion protects Nyx voice.',
  estimatedDurationMs: timing.estimatedDurationMs,
  visemeCount: mapped.count
});
assert.strictEqual(state.enabled, true, 'avatar speech state should enable when speech is allowed');

const normalized = transcriptNormalizer.normalizeVoiceTranscript('Nyx, show me speech sync status');
assert.strictEqual(normalized.commandPhrase, 'speech_sync_status', 'speech sync command should be detected');

const policy = outputPolicy.evaluateVoiceOutputPolicy(spokenText, {
  adminOnlyVoiceDelivery: true,
  adminVoiceDeliveryAllowed: true
});
assert.strictEqual(policy.speakAllowed, true, 'safe protected status should be speakable');
assert.strictEqual(policy.speechSyncAllowed, true, 'speakable policy should allow speech sync');

const disabled = speechSync.buildSpeechSyncEnvelope({
  spokenText,
  speakAllowed: false,
  finalApproved: true,
  adminVoiceDeliveryAllowed: true
});
assert.strictEqual(disabled.enabled, false, 'speech sync must stay disabled when speakAllowed is false');

console.log('PASS nyx-phase2-speech-sync-envelope.test.js');

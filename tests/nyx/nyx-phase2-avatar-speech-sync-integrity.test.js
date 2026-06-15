
'use strict';

const assert = require('assert');
const { buildSpeechSyncEnvelope } = require('../../Data/marion/runtime/NyxSpeechSyncEnvelope');
const { mapTextToVisemes } = require('../../Data/marion/runtime/NyxVisemeMapper');
const { buildSpeechTiming } = require('../../Data/marion/runtime/NyxSpeechTimingAdapter');
const { buildAvatarSpeechState } = require('../../Data/marion/runtime/NyxAvatarSpeechState');
const stabilizer = require('../../Data/marion/runtime/NyxVoiceDeliveryStabilizer');

const text = 'Nyx is connected through Marion. Marion remains the final response authority, admin voice delivery is authorized, and raw audio is not being stored.';
const timing = buildSpeechTiming(text);
assert(timing.estimatedDurationMs > 0, 'timing duration should be positive');
assert.strictEqual(timing.audioStored, false, 'timing must not store audio');

const mapped = mapTextToVisemes(text, { totalDurationMs: timing.estimatedDurationMs });
assert(mapped.count > 0, 'viseme mapper should produce cues');
assert.strictEqual(mapped.audioStored, false, 'viseme mapper must not store audio');
assert.strictEqual(mapped.estimatedDurationMs, timing.estimatedDurationMs, 'visemes should align to timing duration');
for (let i = 1; i < mapped.visemes.length; i += 1) {
  assert(mapped.visemes[i].startMs >= mapped.visemes[i - 1].endMs, 'visemes must be monotonic');
}

const avatar = buildAvatarSpeechState({ speakAllowed: true, spokenText: text, estimatedDurationMs: timing.estimatedDurationMs, visemeCount: mapped.count });
assert.strictEqual(avatar.frontendReady, true, 'avatar state should be frontend ready');
assert.strictEqual(avatar.audioStored, false, 'avatar state must not store audio');

const envelope = buildSpeechSyncEnvelope({
  spokenText: text,
  speakAllowed: true,
  finalApproved: true,
  adminVoiceDeliveryAllowed: true,
  voiceMode: 'full',
  voiceEnvelope: { locale: 'en-CA', adminVoiceDeliveryAllowed: true }
});
assert.strictEqual(envelope.enabled, true, 'speech sync should be enabled for authorized final speech');
assert.strictEqual(envelope.frontendReady, true, 'speech sync should be frontend ready');
assert.strictEqual(envelope.audioStored, false, 'speech sync must not store raw audio');
assert.strictEqual(envelope.visemeCount, envelope.visemes.length, 'viseme count should match array length');
assert.strictEqual(envelope.timingAligned, true, 'viseme timeline should align to timing adapter');

const denied = buildSpeechSyncEnvelope({
  spokenText: text,
  speakAllowed: false,
  finalApproved: true,
  adminVoiceDeliveryAllowed: true
});
assert.strictEqual(denied.enabled, false, 'speech sync must fail closed when speakAllowed is false');

const stable = stabilizer.stabilizeNyxVoiceDelivery({
  response: { final: true, authority: 'Marion', reply: text },
  voiceEnvelope: { authorizationState: 'authorized', adminVoiceVerified: true, adminVoiceDeliveryAllowed: true, userIntentHint: 'status', sessionId: `phase2_${Date.now()}` },
  outputPolicy: { speakAllowed: true, voiceMode: 'full', adminVoiceDeliveryAllowed: true },
  candidateReply: text,
  allowCandidateAsFinal: true
});
assert.strictEqual(stable.speakAllowed, true, 'stabilizer should allow authorized protected status final');
assert.strictEqual(stable.speechSyncEligible, true, 'stabilizer should mark speech sync eligible');
assert.strictEqual(stable.speechSyncInput.audioStored, false, 'stabilizer speech sync seed must not store audio');

console.log('PASS nyx-phase2-avatar-speech-sync-integrity.test.js');

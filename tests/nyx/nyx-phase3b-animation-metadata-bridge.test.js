'use strict';

const assert = require('assert');
const { buildSpeechSyncEnvelope } = require('../../Data/marion/runtime/NyxSpeechSyncEnvelope');
const { buildNyxAvatarExpression } = require('../../Data/marion/runtime/NyxAvatarExpressionController');
const { buildNyxEmotionMotion } = require('../../Data/marion/runtime/NyxEmotionMotionBridge');
const { buildNyxAnimationEnginePacket } = require('../../Data/marion/runtime/NyxAnimationEngineAdapter');
const { createNyxAvatarMotionTelemetry } = require('../../Data/marion/runtime/NyxAvatarMotionTelemetry');

const text = 'Nyx is connected through Marion. Marion remains the final response authority, admin voice delivery is authorized, and raw audio is not being stored.';

const expression = buildNyxAvatarExpression({
  spokenText: text,
  speakAllowed: true,
  finalApproved: true,
  adminVoiceDeliveryAllowed: true
});
assert.strictEqual(expression.frontendReady, true, 'expression should be frontend ready');
assert.strictEqual(expression.audioStored, false, 'expression must not store audio');
assert.ok(expression.expression, 'expression state should be present');

const motion = buildNyxEmotionMotion({
  expression,
  timing: { estimatedDurationMs: 2400, leadInMs: 120, settleMs: 180, totalAnimationWindowMs: 2700 },
  visemes: [{ viseme: 'A', startMs: 0, endMs: 120 }]
});
assert.strictEqual(motion.frontendReady, true, 'motion should be frontend ready');
assert.strictEqual(motion.motionProfile.reducedMotionSafe, true, 'motion must be reduced-motion safe');
assert.ok(Array.isArray(motion.timeline), 'motion timeline should be an array');

const animation = buildNyxAnimationEnginePacket({
  expression,
  motion,
  timing: { estimatedDurationMs: 2400, totalAnimationWindowMs: 2700 },
  avatar: { enabled: true, avatarState: 'voice_delivery_ready', mouthState: 'viseme_sequence_ready' },
  visemes: [{ viseme: 'A', startMs: 0, endMs: 120 }]
});
assert.strictEqual(animation.frontendReady, true, 'animation packet should be frontend ready');
assert.strictEqual(animation.engine, 'custom_dom', 'default engine should be custom_dom');
assert.strictEqual(animation.reducedMotionSafe, true, 'animation packet must be reduced-motion safe');

const telemetry = createNyxAvatarMotionTelemetry({
  spokenText: text,
  expression,
  motion,
  animation,
  timing: { estimatedDurationMs: 2400, totalAnimationWindowMs: 2700 },
  visemeCount: 1
});
assert.strictEqual(telemetry.audioStored, false, 'motion telemetry must not store audio');
assert.strictEqual(telemetry.rawTextStored, false, 'motion telemetry must not store raw text');
assert.ok(telemetry.textHash && telemetry.textHash !== text, 'telemetry should use a hash, not raw text');

const envelope = buildSpeechSyncEnvelope({
  spokenText: text,
  speakAllowed: true,
  finalApproved: true,
  adminVoiceDeliveryAllowed: true,
  voiceMode: 'full',
  voiceEnvelope: {
    locale: 'en-CA',
    adminVoiceDeliveryAllowed: true,
    userIntentHint: 'status'
  }
});
assert.strictEqual(envelope.enabled, true, 'speech sync should remain enabled');
assert.strictEqual(envelope.phase3AnimationMetadataBridge, true, 'phase 3B bridge should be active');
assert.strictEqual(envelope.avatarAnimationEnabled, true, 'avatar animation metadata should be enabled');
assert.ok(envelope.avatar && envelope.avatar.animationEnabled === true, 'avatar should carry animation metadata');
assert.ok(envelope.expression && envelope.expression.frontendReady === true, 'envelope should include expression metadata');
assert.ok(envelope.motion && envelope.motion.frontendReady === true, 'envelope should include motion metadata');
assert.ok(envelope.animation && envelope.animation.frontendReady === true, 'envelope should include animation packet');
assert.ok(envelope.avatarMotionTelemetry && envelope.avatarMotionTelemetry.rawTextStored === false, 'envelope telemetry should not store raw text');
assert.strictEqual(envelope.audioStored, false, 'envelope must not store audio');
assert.strictEqual(envelope.noRawAudioStored, true, 'envelope must preserve no-raw-audio contract');
assert.strictEqual(envelope.phase2SpeechSyncCompatible, true, 'phase 2 compatibility marker should remain true');

const denied = buildSpeechSyncEnvelope({
  spokenText: text,
  speakAllowed: false,
  finalApproved: true,
  adminVoiceDeliveryAllowed: true
});
assert.strictEqual(denied.enabled, false, 'speech sync should fail closed when speakAllowed is false');
assert.strictEqual(denied.phase3AnimationMetadataBridge, false, 'phase 3B should stay off when speech is disabled');
assert.strictEqual(denied.avatarAnimationEnabled, false, 'animation should stay disabled when speech is disabled');

console.log('PASS nyx-phase3b-animation-metadata-bridge.test.js');

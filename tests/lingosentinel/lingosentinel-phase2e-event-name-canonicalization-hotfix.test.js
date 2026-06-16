'use strict';

const assert = require('assert');
const Engine = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelEngine.js');

const roomId = 'phase2e-live-roundtrip-room';

assert.strictEqual(typeof Engine.canonicalizeLingoSentinelEventName, 'function', 'Engine must expose canonicalizeLingoSentinelEventName');
assert.strictEqual(
  Engine.canonicalizeLingoSentinelEventName('lingosentinel.message.liveTRANSLATION_MESSAGE_READY', 'live_translate'),
  'TRANSLATION_MESSAGE_READY',
  'Engine must strip legacy/adaptive event prefixes from live translation events'
);
assert.strictEqual(
  Engine.canonicalizeLingoSentinelEventName('lingosentinel.message.translate.TRANSLATION_MESSAGE_READY', 'live_translate'),
  'TRANSLATION_MESSAGE_READY',
  'Engine must normalize translate-prefixed event names to TRANSLATION_MESSAGE_READY'
);
assert.strictEqual(
  Engine.canonicalizeLingoSentinelEventName('ls.live.TRANSLATION_MESSAGE_READY', 'live_translate'),
  'TRANSLATION_MESSAGE_READY',
  'Engine must normalize legacy ls live event names'
);
assert.strictEqual(
  Engine.canonicalizeLingoSentinelEventName('', 'group_room'),
  'ROOM_MESSAGE_READY',
  'Engine must fallback to mode-specific event names'
);

const plan = Engine.buildSignalPlan({
  mode: 'live_translate',
  roomId,
  sender: { id: 'user-a-phase2e', name: 'User A', preferredLanguage: 'en' },
  recipient: { id: 'user-b-phase2e', name: 'User B', preferredLanguage: 'fr' },
  text: 'Phase 2E event-name canonicalization check.',
  sourceLanguage: 'en',
  targetLanguage: 'fr'
});

assert.strictEqual(plan.ok, true, 'Signal plan should build');
assert.strictEqual(plan.publish.channel, `lingosentinel:translation:${roomId}`);
assert.strictEqual(plan.publish.eventName, 'TRANSLATION_MESSAGE_READY');

console.log('PASS lingosentinel-phase2e-event-name-canonicalization-hotfix');

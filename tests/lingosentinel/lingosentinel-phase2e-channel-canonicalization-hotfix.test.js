'use strict';

const assert = require('assert');
const Engine = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelEngine.js');

(async () => {
  const roomId = 'phase2e-live-roundtrip-room';

  assert.strictEqual(typeof Engine.canonicalizeLingoSentinelChannel, 'function', 'Engine must expose canonicalizeLingoSentinelChannel');
  assert.strictEqual(Engine.canonicalizeLingoSentinelChannel(`lingosentinel:translate:${roomId}`, 'live_translate', roomId), `lingosentinel:translation:${roomId}`);
  assert.strictEqual(Engine.canonicalizeLingoSentinelChannel(`lingosentinel:live:${roomId}`, 'live_translate', roomId), `lingosentinel:translation:${roomId}`);
  assert.strictEqual(Engine.canonicalizeLingoSentinelChannel(`ls:live:${roomId}`, 'live_translate', roomId), `lingosentinel:translation:${roomId}`);
  assert.strictEqual(Engine.canonicalizeLingoSentinelChannel(`ls:translation:${roomId}`, 'live_translate', roomId), `lingosentinel:translation:${roomId}`);

  const confirmed = await Engine.confirmLiveAblyRoundtrip({
    mode: 'live_translate',
    roomId,
    sender: { id: 'user-a-phase2e', name: 'User A', preferredLanguage: 'en' },
    recipient: { id: 'user-b-phase2e', name: 'User B', preferredLanguage: 'fr' },
    text: 'Phase 2E channel canonicalization check.',
    sourceLanguage: 'en',
    targetLanguage: 'fr'
  }, { mockReceive: true, tokenCreated: true, probeId: 'phase2e-channel-hotfix-probe' });

  assert.strictEqual(confirmed.ok, true);
  assert.strictEqual(confirmed.canonicalChannel, `lingosentinel:translation:${roomId}`);
  assert.strictEqual(confirmed.messageReceivedByClient, true);
  assert.strictEqual(confirmed.boundary.marionVisibleParticipant, false);

  console.log('PASS lingosentinel-phase2e-channel-canonicalization-hotfix');
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});

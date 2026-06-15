'use strict';

const assert = require('assert');
const Engine = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelEngine.js');
const LinkGateway = require('../../Data/marion/runtime/LingoSentinelLinkGateway.js');
const RealtimeBridge = require('../../Data/marion/runtime/LingoSentinelRealtimeBridge.js');

(async () => {
  const roomId = 'phase2e-live-roundtrip-room';
  const input = {
    mode: 'live_translate',
    roomId,
    sender: { id: 'user-a-phase2e', name: 'User A', preferredLanguage: 'en' },
    recipient: { id: 'user-b-phase2e', name: 'User B', preferredLanguage: 'fr' },
    text: 'Hello. This is a Phase 2E live roundtrip check.',
    sourceLanguage: 'en',
    targetLanguage: 'fr'
  };

  assert.strictEqual(typeof Engine.confirmLiveAblyRoundtrip, 'function', 'Engine must expose confirmLiveAblyRoundtrip');
  assert.strictEqual(Engine.PHASE2E_LIVE_ROUNDTRIP_VERSION, 'nyx.lingosentinel.engine.liveAblyRoundtrip/2.0');

  const gateway = LinkGateway.prepareLingoSentinelPublish(input);
  assert.strictEqual(gateway.ok, true, 'Gateway must accept normal user-to-user live_translate input');
  assert.strictEqual(gateway.publishInput.route.canonicalChannel, `lingosentinel:translation:${roomId}`);
  assert.strictEqual(gateway.publishInput.phase2eLiveRoundtrip.liveAblyRoundtrip, true);
  assert.strictEqual(gateway.publishInput.phase2eLiveRoundtrip.roundtripReady, true);
  assert.strictEqual(gateway.publishInput.phase2eLiveRoundtrip.marionVisibleParticipant, false);

  const tokenChannel = LinkGateway.channelForMode('live_translate', roomId);
  assert.strictEqual(tokenChannel, `lingosentinel:translation:${roomId}`);
  const alignment = LinkGateway.buildChannelAlignment('live_translate', roomId);
  assert.strictEqual(alignment.tokenChannelMatchesPublishChannel, true);
  assert.strictEqual(alignment.realtimeBridgeChannelMatchesToken, true);

  const bridgeRoundtrip = RealtimeBridge.buildPhase2ERoundtripState(`lingosentinel:translation:${roomId}`, 'TRANSLATION_MESSAGE_READY');
  assert.strictEqual(bridgeRoundtrip.liveAblyRoundtrip, true);
  assert.strictEqual(bridgeRoundtrip.channelNamespaceAligned, true);
  assert.strictEqual(bridgeRoundtrip.realtimeBridgeChannelMatchesToken, true);
  assert.strictEqual(bridgeRoundtrip.marionCanPublishToRoom, false);

  const confirmed = await Engine.confirmLiveAblyRoundtrip(input, {
    mockReceive: true,
    tokenCreated: true,
    probeId: 'phase2e-test-probe'
  });

  assert.strictEqual(confirmed.ok, true, 'Mock roundtrip should confirm');
  assert.strictEqual(confirmed.stage, 'live_roundtrip_confirmed');
  assert.strictEqual(confirmed.canonicalChannel, `lingosentinel:translation:${roomId}`);
  assert.strictEqual(confirmed.clientSubscribed, true);
  assert.strictEqual(confirmed.publishOk, true);
  assert.strictEqual(confirmed.messageReceivedByClient, true);
  assert.strictEqual(confirmed.receivedEventType, 'TRANSLATION_MESSAGE_READY');
  assert.strictEqual(confirmed.phase2eRoundtrip.version, 'nyx.lingosentinel.engine.liveAblyRoundtrip/2.0');
  assert.strictEqual(confirmed.boundary.marionVisibleParticipant, false);
  assert.strictEqual(confirmed.boundary.publicUsersMayAddressMarion, false);

  console.log('PASS lingosentinel-phase2e-live-ably-roundtrip');
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});

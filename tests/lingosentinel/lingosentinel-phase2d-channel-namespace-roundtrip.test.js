'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');

const root = path.resolve(__dirname, '..', '..');

function assertNoSyntax(relativePath) {
  const full = path.join(root, relativePath);
  assert.ok(fs.existsSync(full), `Missing file: ${relativePath}`);
  new Function(fs.readFileSync(full, 'utf8'));
}

[
  'index.js',
  'Data/marion/runtime/LingoSentinelLinkGateway.js',
  'Data/marion/runtime/LingoSentinelPublishRoute.js',
  'Data/marion/runtime/LingoSentinelRealtimeBridge.js',
  'Data/marion/runtime/LingoSentinelSubscribeTokenRoute.js',
  'Data/marion/runtime/LingoSentinelPrivateMarionVoiceRoute.js'
].forEach(assertNoSyntax);

const linkGateway = require(path.join(root, 'Data/marion/runtime/LingoSentinelLinkGateway.js'));
const realtime = require(path.join(root, 'Data/marion/runtime/LingoSentinelRealtimeBridge.js'));

const prepared = linkGateway.prepareLingoSentinelPublish({
  mode: 'live_translate',
  roomId: 'phase2d-roundtrip-room',
  sender: { id: 'user-a', name: 'User A', preferredLanguage: 'en' },
  recipient: { id: 'user-b', name: 'User B', preferredLanguage: 'fr' },
  text: 'Hello, continue in French.',
  sourceLanguage: 'en',
  targetLanguage: 'fr'
});

assert.strictEqual(prepared.ok, true, 'Link gateway should prepare valid live_translate publish input.');
assert.strictEqual(prepared.publishInput.route.canonicalChannel, 'lingosentinel:translation:phase2d-roundtrip-room');
assert.strictEqual(prepared.publishInput.route.ablyChannel, 'lingosentinel:translation:phase2d-roundtrip-room');
assert.strictEqual(prepared.publishInput.route.channelAlignment.channelNamespaceAligned, true);
assert.strictEqual(prepared.publishInput.route.channelAlignment.tokenChannelMatchesPublishChannel, true);
assert.strictEqual(prepared.publishInput.route.channelAlignment.realtimeBridgeChannelMatchesToken, true);
assert.strictEqual(prepared.publishInput.userBoundary.marionVisibleParticipant, false);
assert.strictEqual(prepared.publishInput.userBoundary.publicUsersMayAddressMarion, false);

assert.strictEqual(linkGateway.channelForMode('one_to_one', 'r1'), 'lingosentinel:direct:r1');
assert.strictEqual(linkGateway.channelForMode('group_room', 'r1'), 'lingosentinel:room:r1');
assert.strictEqual(linkGateway.channelForMode('live_translate', 'r1'), 'lingosentinel:translation:r1');
assert.strictEqual(linkGateway.channelForMode('delivered', 'r1'), 'lingosentinel:delivered:r1');

assert.strictEqual(realtime.buildChannelName('lingosentinel', 'translation', 'phase2d-roundtrip-room'), 'lingosentinel:translation:phase2d-roundtrip-room');
assert.strictEqual(realtime.channelForMode('live_translate', 'phase2d-roundtrip-room'), 'lingosentinel:translation:phase2d-roundtrip-room');
assert.strictEqual(realtime.buildChannelAlignment('live_translate', 'phase2d-roundtrip-room').realtimeBridgeChannelMatchesToken, true);

// Load Express-route modules with a minimal fake Router so the test can run in
// clean CI environments that do not install express just to inspect route contracts.
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'express') {
    return {
      Router() {
        const router = function noopRouter() {};
        router.get = () => router;
        router.post = () => router;
        router.options = () => router;
        router.use = () => router;
        return router;
      }
    };
  }
  if (/MarionVoiceGateway$|MarionVoiceGateway\.js$/.test(request)) {
    return { VERSION: 'test-marion-voice-gateway', handleVoiceTranscript() {} };
  }
  return originalLoad.apply(this, arguments);
};

try {
  const tokenRoute = require(path.join(root, 'Data/marion/runtime/LingoSentinelSubscribeTokenRoute.js'));
  const publishRoute = require(path.join(root, 'Data/marion/runtime/LingoSentinelPublishRoute.js'));
  assert.strictEqual(tokenRoute.channelForMode('live_translate', 'phase2d-roundtrip-room'), 'lingosentinel:translation:phase2d-roundtrip-room');
  assert.strictEqual(tokenRoute.buildChannelAlignment('live_translate', 'phase2d-roundtrip-room').tokenChannelMatchesPublishChannel, true);
  assert.strictEqual(publishRoute.phase2dChannelAlignment(prepared.publishInput).canonicalChannel, 'lingosentinel:translation:phase2d-roundtrip-room');
  assert.strictEqual(publishRoute.phase2dChannelAlignment(prepared.publishInput).roundtripReady, true);
} finally {
  Module._load = originalLoad;
}

const indexText = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
assert.ok(indexText.includes('LINGOSENTINEL-PHASE2D-CHANNEL-NAMESPACE-ROUNDTRIP-HARDLOCK'));
assert.ok(indexText.includes('/api/lingosentinel/phase2d/health'));
assert.ok(indexText.includes('lingosentinel:translation:{roomId}'));
assert.ok(!indexText.includes('"ls:live:{sessionId}"'), 'Index readiness contract must not advertise old ls:live namespace.');
assert.ok(!indexText.includes('const channel = "ls:room:'), 'Index fallback publishing must not use old ls:room namespace.');

console.log('PASS lingosentinel-phase2d-channel-namespace-roundtrip');

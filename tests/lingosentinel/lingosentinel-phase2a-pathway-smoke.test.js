'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..', '..');
const linkGateway = require(path.join(root, 'Data/marion/runtime/LingoSentinelLinkGateway.js'));
const realtime = require(path.join(root, 'Data/marion/runtime/LingoSentinelRealtimeBridge.js'));

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const previewEnFr = linkGateway.routePreview({
  mode: 'live_translate',
  text: 'Hello, can we continue in French?',
  roomId: 'phase2a-room',
  sender: { id: 'user-a', preferredLanguage: 'English' },
  sourceLanguage: 'English',
  targetLanguage: 'French',
  previousLanguage: 'Spanish',
  languagePair: { source: 'English', target: 'French' }
});

assert.strictEqual(previewEnFr.ok, true);
assert.strictEqual(previewEnFr.languagePair.source, 'en');
assert.strictEqual(previewEnFr.languagePair.target, 'fr');
assert.strictEqual(previewEnFr.languageContinuity.enFrEsContinuityActive, true);
assert.strictEqual(previewEnFr.languageContinuity.languageContinuityPreserved, true);
assert.strictEqual(previewEnFr.languageContinuity.contextCarryPreserved, true);
assert.strictEqual(previewEnFr.languageContinuity.languageDriftDetected, true);
assert.strictEqual(previewEnFr.marionVisibleParticipant, false);
assert.strictEqual(previewEnFr.visibleToUsers, false);
assert.strictEqual(previewEnFr.lane, 'translation');
assert.strictEqual(previewEnFr.ablyChannel, 'lingosentinel:translation:phase2a-room');

const previewEsFr = linkGateway.routePreview({
  mode: 'group_room',
  text: 'Hola, seguimos con el mismo tema.',
  roomId: 'phase2a-group',
  sender: { id: 'user-b', preferredLanguage: 'es' },
  sourceLanguage: 'Spanish',
  targetLanguage: 'French',
  previousLanguage: 'en'
});
assert.strictEqual(previewEsFr.ok, true);
assert.strictEqual(previewEsFr.languageContinuity.sourceLanguage, 'es');
assert.strictEqual(previewEsFr.languageContinuity.targetLanguage, 'fr');
assert.strictEqual(previewEsFr.languageContinuity.silentOversight, true);

assert.strictEqual(realtime.buildChannelName('lingosentinel', 'translation', 'phase2a-room'), 'lingosentinel:translation:phase2a-room');

const subscribeRouteText = read('Data/marion/runtime/LingoSentinelSubscribeTokenRoute.js');
assert.ok(subscribeRouteText.includes('CHANNEL_NAMESPACE') && subscribeRouteText.includes(':direct:'));
assert.ok(subscribeRouteText.includes('CHANNEL_NAMESPACE') && subscribeRouteText.includes(':translation:'));
assert.ok(!subscribeRouteText.includes('return `ls:direct'));

const gatewayText = read('Data/marion/runtime/LingoSentinel/LingoSentinelGateway.js');
assert.ok(gatewayText.includes('buildEnFrEsContinuitySmokeCarry'));
assert.ok(gatewayText.includes('marionVisibleParticipant: false'));

console.log('PASS lingosentinel-phase2a-pathway-smoke');

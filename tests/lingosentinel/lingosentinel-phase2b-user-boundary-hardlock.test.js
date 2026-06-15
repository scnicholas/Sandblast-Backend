'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const runtimeRoot = path.join(repoRoot, 'Data', 'marion', 'runtime');

const linkGateway = require(path.join(runtimeRoot, 'LingoSentinelLinkGateway.js'));
const realtime = require(path.join(runtimeRoot, 'LingoSentinelRealtimeBridge.js'));

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function assertBoundary(obj, label) {
  assert.strictEqual(obj.userToUserBoundary, true, `${label}: userToUserBoundary`);
  assert.strictEqual(obj.silentOversight, true, `${label}: silentOversight`);
  assert.strictEqual(obj.marionVisibleParticipant, false, `${label}: marionVisibleParticipant`);
  assert.strictEqual(obj.marionRenderedAsSpeaker, false, `${label}: marionRenderedAsSpeaker`);
  assert.strictEqual(obj.marionCanPublishToRoom, false, `${label}: marionCanPublishToRoom`);
  assert.strictEqual(obj.marionCanAppearInUserRoster, false, `${label}: marionCanAppearInUserRoster`);
  assert.strictEqual(obj.publicUsersMayAddressMarion, false, `${label}: publicUsersMayAddressMarion`);
}

const normal = linkGateway.prepareLingoSentinelPublish({
  mode: 'live_translate',
  roomId: 'phase2b-public-room',
  sender: { id: 'user-a', name: 'User A', preferredLanguage: 'en' },
  recipient: { id: 'user-b', name: 'User B', preferredLanguage: 'fr' },
  text: 'Hello, continue in French and Spanish.',
  sourceLanguage: 'en',
  targetLanguage: 'fr'
});
assert.strictEqual(normal.ok, true, 'normal user-to-user live_translate should pass');
assertBoundary(normal.publishInput.userBoundary, 'publishInput.userBoundary');
assertBoundary(normal.governance.userBoundary, 'governance.userBoundary');
assert.strictEqual(normal.publishInput.sender.id, 'user-a');
assert.strictEqual(normal.publishInput.recipient.id, 'user-b');
assert.strictEqual(normal.publishInput.languageContinuity.enFrEsContinuityActive, true);
assert.strictEqual(normal.publishInput.languageContinuity.contextCarryPreserved, true);

const marionSender = linkGateway.prepareLingoSentinelPublish({
  mode: 'group_room',
  roomId: 'phase2b-public-room',
  sender: { id: 'Marion', name: 'Marion', preferredLanguage: 'en' },
  text: 'I am Marion in the room.'
});
assert.strictEqual(marionSender.ok, false, 'Marion sender spoof must be rejected');
assert(marionSender.errors.join(' ').includes('Marion'), 'Marion sender rejection should name boundary');
assertBoundary(marionSender.governance.userBoundary, 'rejected.governance.userBoundary');

const marionRecipient = linkGateway.prepareLingoSentinelPublish({
  mode: 'one_to_one',
  roomId: 'phase2b-direct-room',
  sender: { id: 'user-a', name: 'User A', preferredLanguage: 'en' },
  recipient: { id: 'marion-authority', name: 'Marion Authority', preferredLanguage: 'en' },
  text: 'Can Marion join this direct chat?'
});
assert.strictEqual(marionRecipient.ok, false, 'Marion recipient spoof must be rejected');

const publicEvent = realtime.sanitizeEvent({
  type: realtime.EVENT_TYPES.ROOM_MESSAGE_READY,
  roomId: 'phase2b-public-room',
  message: 'Bonjour, seguimos en español.',
  languageHint: 'fr'
}, { maxMessageLength: 1500, maxRegionLength: 80, maxCityLength: 80, maxRoomIdLength: 96, maxSessionIdLength: 96 });
assert(publicEvent, 'normal realtime event should sanitize');
assertBoundary(publicEvent, 'realtime.publicEvent');

const blockedRealtime = realtime.sanitizeEvent({
  type: realtime.EVENT_TYPES.ROOM_MESSAGE_READY,
  roomId: 'marion-control-room',
  message: 'Marion appears as a public room.'
}, { maxMessageLength: 1500, maxRegionLength: 80, maxCityLength: 80, maxRoomIdLength: 96, maxSessionIdLength: 96 });
assert.strictEqual(blockedRealtime, null, 'public Marion realtime room must be blocked');

const tokenRoute = read('Data/marion/runtime/LingoSentinelSubscribeTokenRoute.js');
assert(tokenRoute.includes('Public LingoSentinel tokens cannot be minted for Marion identities'), 'token route must reject Marion public token targets');
assert(tokenRoute.includes('marionPublicChannelAllowed: false'), 'token route must hardlock Marion public channel false');

const publishRoute = read('Data/marion/runtime/LingoSentinelPublishRoute.js');
assert(publishRoute.includes('Marion is private authority only'), 'publish route must reject public Marion spoofing');
assert(publishRoute.includes('phase2bBoundary'), 'publish route must expose phase2b boundary helper');

const privateVoiceRoute = read('Data/marion/runtime/LingoSentinelPrivateMarionVoiceRoute.js');
assert(privateVoiceRoute.includes('privateAdminOnly: true'), 'private Marion voice route must remain admin-only');
assert(privateVoiceRoute.includes('publicUsersMayAddressMarion: false'), 'private Marion voice route must not open public Marion addressing');

const sentinelGateway = read('Data/marion/runtime/LingoSentinel/LingoSentinelGateway.js');
assert(sentinelGateway.includes('PHASE2B_USER_BOUNDARY_VERSION'), 'LingoSentinelGateway must carry phase2b boundary version');
assert(sentinelGateway.includes('marionRenderedAsSpeaker: false'), 'LingoSentinelGateway must block Marion as rendered speaker');

const index = read('index.js');
assert(index.includes('/api/lingosentinel/phase2b/health'), 'index must expose Phase 2B health route');
assert(index.includes('tryRequireMany([\n  "./Data/marion/runtime/LingoSentinelPrivateMarionVoiceRoute"'), 'index must safely mount private Marion route');

console.log('PASS lingosentinel-phase2b-user-boundary-hardlock');

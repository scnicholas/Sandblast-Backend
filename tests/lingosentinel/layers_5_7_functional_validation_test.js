'use strict';

const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const runtime = path.join(root, 'Data', 'marion', 'runtime', 'LingoSentinel');
function mod(name) { return require(path.join(runtime, name)); }

const RoomRegistry = mod('LingoSentinelRoomRegistry');
const ConnectionState = mod('LingoSentinelConnectionState');
const TokenPolicy = mod('LingoSentinelTokenPolicy');
const Gateway = mod('LingoSentinelLinkGateway');
const MessagePolicy = mod('LingoSentinelMessagePolicy');
const MessageValidator = mod('LingoSentinelMessageValidator');
const MessagePublisherModule = mod('LingoSentinelMessagePublisher');
const PublicProjection = mod('LingoSentinelPublicMessageProjection');
const RealtimeBridge = mod('LingoSentinelRealtimeBridge');
const RuntimeHealth = mod('LingoSentinelRuntimeHealth');

let passed = 0;
function check(name, fn) {
  try {
    const value = fn();
    if (value && typeof value.then === 'function') return value.then(function () { passed += 1; console.log('PASS', name); });
    passed += 1; console.log('PASS', name); return Promise.resolve();
  } catch (error) {
    console.error('FAIL', name, error && error.stack || error); process.exitCode = 1; return Promise.reject(error);
  }
}

async function main() {
  RoomRegistry.reset(); ConnectionState.reset(); MessagePublisherModule.reset();
  const alice = { clientId: 'lsu_alice_0001', sessionId: 'lss_alice_0001', displayName: 'Alice' };
  const bob = { clientId: 'lsu_bob_000002', sessionId: 'lss_bob_000002', displayName: 'Bob' };

  const joinA = RoomRegistry.join('lingosentinel-main', alice);
  await check('room join issues opaque credential', function () {
    assert.equal(joinA.ok, true); assert.ok(/^lsmc_/.test(joinA.membershipCredential)); assert.equal('sessionId' in joinA.membership, false);
  });
  const aliceContext = { ...alice, membershipCredential: joinA.membershipCredential };

  await check('wrong credential rejected', function () {
    const auth = RoomRegistry.authorize('lingosentinel-main', { ...alice, membershipCredential: 'lsmc_wrong' }, 'publish');
    assert.equal(auth.ok, false); assert.equal(auth.code, 'MEMBERSHIP_CREDENTIAL_INVALID');
  });
  await check('correct credential authorizes room', function () {
    const auth = RoomRegistry.authorize('lingosentinel-main', aliceContext, 'publish');
    assert.equal(auth.ok, true); assert.equal(auth.membership.clientId, alice.clientId); assert.equal('sessionId' in auth.membership, false);
  });
  await check('token capability is subscription-only', function () {
    const cap = TokenPolicy.buildCapability(TokenPolicy.channelForMode('group_room', 'lingosentinel-main'));
    Object.values(cap).forEach(function (actions) { assert.equal(actions.includes('publish'), false); });
    assert.equal(cap['lingosentinel:room:lingosentinel-main'].includes('subscribe'), true);
  });
  await check('client roomAuthorization bypass is rejected', function () {
    const result = Gateway.prepareLingoSentinelPublish({
      mode: 'group_room', roomId: 'lingosentinel-main', text: 'Hello', roomAuthorization: { ok: true },
      sender: { id: alice.clientId, clientId: alice.clientId, sessionId: alice.sessionId, name: 'Alice' }
    });
    assert.equal(result.ok, false);
  });

  const registered = ConnectionState.register({ ...alice, roomId: 'lingosentinel-main' });
  ConnectionState.update(alice.sessionId, 'connecting');
  ConnectionState.update(alice.sessionId, 'connected');
  await check('connection becomes message eligible', function () {
    assert.equal(registered.ok, true);
    assert.equal(ConnectionState.isSendEligible(alice.sessionId, { clientId: alice.clientId, roomId: 'lingosentinel-main' }).ok, true);
  });

  let providerCalls = 0;
  let captured = null;
  const fakeBridge = {
    async publishMessage(message, context) {
      providerCalls += 1; captured = { message, context };
      return { ok: true, publishedAt: '2026-07-24T18:00:00.000Z' };
    }
  };
  const Publisher = MessagePublisherModule.LingoSentinelMessagePublisher;
  const publisher = new Publisher({ realtimeBridge: fakeBridge });
  const request = { clientRequestId: 'lsreq_test_0001', roomId: 'lingosentinel-main', mode: 'group_room', type: 'text', text: 'Hello', sourceLanguage: 'en', targetLanguage: 'en' };
  const result = await publisher.publish(request, aliceContext);

  await check('English message publishes through backend authority', function () {
    assert.equal(result.ok, true); assert.equal(providerCalls, 1); assert.equal(result.translationStatus, 'bypassed');
  });
  const aliceMessage = captured.message;
  await check('canonical envelope is public-safe', function () {
    assert.equal(aliceMessage.contract, 'lingosentinel.message/1.0');
    assert.equal(aliceMessage.eventType, 'LINGOSENTINEL_MESSAGE_CREATED');
    assert.equal(aliceMessage.originalText, 'Hello'); assert.equal(aliceMessage.displayText, 'Hello');
    assert.equal(aliceMessage.sender.clientId, alice.clientId); assert.equal('sessionId' in aliceMessage.sender, false);
    assert.equal(PublicProjection.validateProjection(aliceMessage).ok, true);
  });
  await check('server assigns room sequence', function () { assert.equal(aliceMessage.sequence, 1); });
  await check('duplicate client request is idempotent', async function () {
    const replay = await publisher.publish(request, aliceContext);
    assert.equal(replay.ok, true); assert.equal(replay.idempotentReplay, true); assert.equal(providerCalls, 1);
  });
  await check('browser sender spoof is rejected', async function () {
    const bad = await publisher.publish({ ...request, clientRequestId: 'lsreq_spoof_1', sender: { clientId: bob.clientId } }, aliceContext);
    assert.equal(bad.ok, false); assert.ok(bad.errors.some(function (e) { return e.code === 'SERVER_CONTROLLED_FIELDS_REJECTED'; }));
  });
  await check('cross-room publication is rejected', async function () {
    const bad = await publisher.publish({ ...request, clientRequestId: 'lsreq_room_2', roomId: 'other-room' }, aliceContext);
    assert.equal(bad.ok, false);
  });
  await check('non-English request is rejected during certification', async function () {
    const bad = await publisher.publish({ ...request, clientRequestId: 'lsreq_fr_1', sourceLanguage: 'fr', targetLanguage: 'en' }, aliceContext);
    assert.equal(bad.ok, false); assert.ok(bad.errors.some(function (e) { return e.code === 'ENGLISH_SOURCE_REQUIRED'; }));
  });
  await check('executable markup is rejected', async function () {
    const bad = await publisher.publish({ ...request, clientRequestId: 'lsreq_script_1', text: '<script>alert(1)</script>' }, aliceContext);
    assert.equal(bad.ok, false); assert.ok(bad.errors.some(function (e) { return e.code === 'EXECUTABLE_MARKUP_BLOCKED'; }));
  });
  await check('ordinary password discussion is not falsely treated as secret', async function () {
    const ok = await publisher.publish({ ...request, clientRequestId: 'lsreq_password_1', text: 'I forgot my password.' }, aliceContext);
    assert.equal(ok.ok, true);
  });
  await check('actual secret assignment is blocked by gateway', async function () {
    const bad = await publisher.publish({ ...request, clientRequestId: 'lsreq_secret_1', text: 'password=abcdef123456' }, aliceContext);
    assert.equal(bad.ok, false); assert.equal(bad.stage, 'gateway_governance');
  });

  const joinB = RoomRegistry.join('lingosentinel-main', bob);
  const bobContext = { ...bob, membershipCredential: joinB.membershipCredential };
  ConnectionState.register({ ...bob, roomId: 'lingosentinel-main' });
  ConnectionState.update(bob.sessionId, 'connecting'); ConnectionState.update(bob.sessionId, 'connected');
  await check('second participant joins without session exposure', function () {
    assert.equal(joinB.ok, true); assert.equal('sessionId' in joinB.membership, false);
    const list = RoomRegistry.listParticipants('lingosentinel-main'); assert.equal(list.participants.length, 2); assert.equal(list.participants.some(function (p) { return 'sessionId' in p; }), false);
  });
  await check('second participant can publish isolated message', async function () {
    const reply = await publisher.publish({ ...request, clientRequestId: 'lsreq_bob_1', text: 'I can hear you.' }, bobContext);
    assert.equal(reply.ok, true); assert.equal(reply.sequence > result.sequence, true);
  });

  await check('realtime bridge enforces MessagePublisher authority', async function () {
    let published = null;
    RealtimeBridge.setRestClientForTests({ channels: { get: function () { return { publish: async function (name, data) { published = { name, data }; } }; } } });
    let rejected = false;
    try { await RealtimeBridge.publishMessage(aliceMessage, { ...aliceContext, roomId: 'lingosentinel-main', mode: 'group_room', authority: 'OtherPublisher' }); }
    catch (e) { rejected = e.code === 'MESSAGE_PUBLISHER_AUTHORITY_REQUIRED'; }
    assert.equal(rejected, true); assert.equal(published, null);
    RealtimeBridge.setRestClientForTests(null);
  });

  await check('runtime health recognizes Layers 5-7 modules', function () {
    const health = RuntimeHealth.buildRuntimeHealth({ rootDir: root });
    assert.equal(health.layers5to7Ready, true); assert.equal(health.boundaries.directBrowserPublishAllowed, false);
  });

  await check('raw message validator requires connected verified membership', function () {
    const valid = MessageValidator.validatePublishRequest(request, aliceContext);
    assert.equal(valid.ok, true);
    const invalid = MessageValidator.validatePublishRequest(request, { ...alice, membershipCredential: 'bad' });
    assert.equal(invalid.ok, false);
  });

  // Browser receiver validation with a controlled realtime stub.
  global.LingoSentinelPublicRealtimeClient = {
    getState: function () { return { state: 'connected', active: { roomId: 'lingosentinel-main', clientId: bob.clientId } }; },
    subscribe: async function (_handler, eventName) { assert.equal(eventName, 'LINGOSENTINEL_MESSAGE_CREATED'); return { ok: true }; },
    onStateChange: function () { return function () {}; }
  };
  const receiverPath = path.join(root, 'public', 'lingosentinel', 'lingosentinel-public-message-receiver.js');
  delete require.cache[require.resolve(receiverPath)];
  const Receiver = require(receiverPath);
  await Receiver.start({ roomId: 'lingosentinel-main', clientId: bob.clientId });
  await check('browser receiver accepts canonical room message', function () {
    const accepted = Receiver.receive({ name: 'LINGOSENTINEL_MESSAGE_CREATED', data: aliceMessage });
    assert.equal(accepted.ok, true); assert.equal(accepted.message.direction, 'incoming'); assert.equal(accepted.message.text, 'Hello');
  });
  await check('browser receiver suppresses duplicate message', function () {
    const duplicate = Receiver.receive({ name: 'LINGOSENTINEL_MESSAGE_CREATED', data: aliceMessage });
    assert.equal(duplicate.ok, false); assert.equal(duplicate.code, 'DUPLICATE_REJECTED');
  });
  await check('browser receiver rejects wrong-room message', function () {
    const wrong = Receiver.receive({ name: 'LINGOSENTINEL_MESSAGE_CREATED', data: { ...aliceMessage, messageId: 'lsm_wrong_room', roomId: 'other-room' } });
    assert.equal(wrong.ok, false); assert.equal(wrong.code, 'WRONG_ROOM_REJECTED');
  });
  await check('browser receiver rejects private field leakage', function () {
    const leaked = Receiver.receive({ name: 'LINGOSENTINEL_MESSAGE_CREATED', data: { ...aliceMessage, messageId: 'lsm_leak', sessionId: 'secret' } });
    assert.equal(leaked.ok, false); assert.equal(leaked.code, 'PRIVATE_FIELD_REJECTED');
  });
  Receiver.stop();

  const realtimeClientPath = path.join(root, 'public', 'lingosentinel', 'lingosentinel-public-realtime-client.js');
  delete require.cache[require.resolve(realtimeClientPath)];
  const BrowserRealtime = require(realtimeClientPath);
  await check('direct browser publish API is hard blocked', async function () {
    let blocked = false; try { await BrowserRealtime.publish('x', {}); } catch (e) { blocked = e.message === 'LINGOSENTINEL_DIRECT_BROWSER_PUBLISH_DISABLED'; }
    assert.equal(blocked, true);
  });

  await check('message policy rejects client-controlled finalized fields', function () {
    const validation = MessagePolicy.validateRawRequest({ ...request, messageId: 'forged' });
    assert.equal(validation.ok, false); assert.ok(validation.errors.some(function (e) { return e.code === 'SERVER_CONTROLLED_FIELDS_REJECTED'; }));
  });

  console.log(JSON.stringify({ ok: !process.exitCode, passed, suite: 'LingoSentinel Layers 5-7 functional validation' }, null, 2));
}

main().catch(function () { process.exitCode = 1; });

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME = path.join(ROOT, 'Data', 'marion', 'runtime', 'LingoSentinel');

function fakeRouter() {
  function router() {}
  router.routes = [];
  for (const method of ['get', 'post', 'options', 'use']) {
    router[method] = function register(routePath, handler) {
      router.routes.push({ method, path: routePath, handler });
      return router;
    };
  }
  return router;
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'express') return { Router: fakeRouter };
  if (request === 'ably') {
    return {
      Rest: class MockRest {
        constructor() {
          this.auth = { createTokenRequest: async (input) => ({ clientId: input.clientId, ttl: input.ttl, capability: input.capability, nonce: 'mock', timestamp: Date.now(), mac: 'mock' }) };
          this.channels = { get: (name) => ({ publish: async () => ({ name }) }) };
        }
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

async function invoke(router, method, routePath, req) {
  const entry = router.routes.find((item) => item.method === method && item.path === routePath);
  assert(entry, `route missing: ${method.toUpperCase()} ${routePath}`);
  const res = mockResponse();
  await entry.handler(Object.assign({ body: {}, query: {}, params: {}, app: {} }, req || {}), res);
  return res;
}

async function run() {
  const policy = require(path.join(RUNTIME, 'LingoSentinelRoomPolicy.js'));
  const memberships = require(path.join(RUNTIME, 'LingoSentinelRoomMembership.js'));
  const registry = require(path.join(RUNTIME, 'LingoSentinelRoomRegistry.js'));
  registry.reset();

  assert.strictEqual(policy.validateRoomInput({ roomType: 'translation_room' }).ok, false);
  assert.strictEqual(policy.validateRoomInput({ roomId: 'marion-admin-room', roomType: 'group_room' }).ok, false);

  const creator = { clientId: 'lsu_creator_123456', sessionId: 'lss_creator_123456', displayName: 'Creator' };
  const second = { clientId: 'lsu_second_1234567', sessionId: 'lss_second_1234567', displayName: 'Second' };
  const third = { clientId: 'lsu_third_12345678', sessionId: 'lss_third_12345678', displayName: 'Third' };
  const created = registry.create({ roomId: 'direct-room-123', roomType: 'one_to_one', displayName: 'Direct Room', invitedClientIds: [second.clientId] }, creator);
  assert.strictEqual(created.ok, true);
  assert.strictEqual(registry.join('direct-room-123', second).ok, true);
  assert.strictEqual(registry.join('direct-room-123', third).ok, false, 'one-to-one cap must hold');
  assert.strictEqual(registry.authorize('direct-room-123', creator, 'publish').ok, true);
  assert.strictEqual(registry.authorize('lingosentinel-main', creator, 'publish').ok, false, 'cross-room membership must not leak');
  assert.strictEqual(registry.listParticipants('direct-room-123').participants.length, 2);

  const group = registry.create({ roomId: 'group-room-123', roomType: 'group_room', displayName: 'Group Room' }, creator);
  assert.strictEqual(group.ok, true);
  assert.strictEqual(registry.join('group-room-123', third).ok, true);

  const inviteGroup = registry.create({ roomId: 'invite-group-123', roomType: 'group_room', joinPolicy: 'invite_only', invitedClientIds: [second.clientId], displayName: 'Invite Group' }, creator);
  assert.strictEqual(inviteGroup.ok, true);
  assert.strictEqual(registry.join('invite-group-123', second).ok, true);
  assert.strictEqual(registry.join('invite-group-123', third, { invited: true }).ok, false, 'client invitation assertions must be ignored');

  const gateway = require(path.join(RUNTIME, 'LingoSentinelLinkGateway.js'));
  const goodPublish = gateway.prepareLingoSentinelPublish({
    mode: 'group_room', roomId: 'group-room-123', text: 'Hello',
    sender: creator, sourceLanguage: 'en', targetLanguage: 'en'
  });
  assert.strictEqual(goodPublish.ok, true);
  const blockedPublish = gateway.prepareLingoSentinelPublish({
    mode: 'group_room', roomId: 'group-room-123', text: 'Blocked',
    sender: second, sourceLanguage: 'en', targetLanguage: 'en'
  });
  assert.strictEqual(blockedPublish.ok, false);
  assert(blockedPublish.errors.some((item) => /membership/i.test(item)));

  process.env.ABLY_ROOT_API_KEY = 'mock-app.mock-key:mock-secret';
  const tokenRoute = require(path.join(RUNTIME, 'LingoSentinelSubscribeTokenRoute.js'));
  let res = await invoke(tokenRoute, 'post', '/token', { body: { mode: 'group_room', roomId: 'group-room-123', ...second } });
  assert.strictEqual(res.statusCode, 403, 'token must be blocked without membership');
  registry.join('group-room-123', second);
  res = await invoke(tokenRoute, 'post', '/token', { body: { mode: 'group_room', roomId: 'group-room-123', ...second } });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.roomAuthorization.ok, true);

  const roomRoute = require(path.join(RUNTIME, 'LingoSentinelRoomRoute.js'));
  let roomRes = await invoke(roomRoute, 'get', '/rooms/:roomId/participants', {
    params: { roomId: 'group-room-123' },
    query: { clientId: creator.clientId, sessionId: creator.sessionId }
  });
  assert.strictEqual(roomRes.statusCode, 200);
  assert.strictEqual(roomRes.body.sessionIdsExposed, false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(roomRes.body.participants[0], 'sessionId'), false);
  roomRes = await invoke(roomRoute, 'get', '/rooms/:roomId', {
    params: { roomId: 'group-room-123' },
    query: { clientId: 'lsu_outsider_12345', sessionId: 'lss_outsider_12345' }
  });
  assert.strictEqual(roomRes.statusCode, 403, 'room metadata must require membership');

  const connectionState = require(path.join(RUNTIME, 'LingoSentinelConnectionState.js'));
  connectionState.reset();
  assert.strictEqual(connectionState.register({ roomId: 'group-room-123', ...creator }).ok, true);
  assert.strictEqual(connectionState.update(creator.sessionId, 'connecting').ok, true);
  assert.strictEqual(connectionState.update(creator.sessionId, 'connected').ok, true);
  assert.strictEqual(connectionState.update(creator.sessionId, 'initialized').ok, false, 'invalid transition must fail');
  assert.strictEqual(connectionState.update(creator.sessionId, 'reconnecting').ok, true);
  assert.strictEqual(connectionState.update(creator.sessionId, 'connected').ok, true);

  const reconnect = require(path.join(RUNTIME, 'LingoSentinelReconnectPolicy.js'));
  assert.strictEqual(reconnect.decision(0, { status: 403 }).retry, false);
  assert.strictEqual(reconnect.decision(0, { code: 'temporary_network' }).retry, true);
  assert.strictEqual(reconnect.decision(8, { code: 'temporary_network' }).retry, false);

  const connectionRoute = require(path.join(RUNTIME, 'LingoSentinelConnectionRoute.js'));
  connectionState.reset();
  res = await invoke(connectionRoute, 'post', '/connections/register', { body: { roomId: 'group-room-123', ...third } });
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.connection.state, 'connecting');
  res = await invoke(connectionRoute, 'post', '/connections/state', { body: { sessionId: third.sessionId, clientId: 'lsu_wrong_1234567', state: 'connected' } });
  assert.strictEqual(res.statusCode, 403, 'connection mutation must be client-bound');
  res = await invoke(connectionRoute, 'post', '/connections/state', { body: { sessionId: third.sessionId, clientId: third.clientId, state: 'connected' } });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.connection.state, 'connected');

  const realtimeBridge = require(path.join(RUNTIME, 'LingoSentinelRealtimeBridge.js'));
  const published = await realtimeBridge.publish({ roomId: 'group-room-123', mode: 'group_room', ...creator, eventName: 'TEST', payload: { text: 'Hello', token: 'must-strip' } });
  assert.strictEqual(published.ok, true);
  assert.strictEqual(realtimeBridge.sanitizePayload({ text: 'x', token: 'secret' }).token, undefined);

  const realtimeClient = require(path.join(ROOT, 'public', 'lingosentinel', 'lingosentinel-public-realtime-client.js'));
  assert.strictEqual(typeof realtimeClient.connect, 'function');
  assert.strictEqual(typeof realtimeClient.subscribe, 'function');
  assert.strictEqual(typeof realtimeClient.disconnect, 'function');
  assert.strictEqual(typeof realtimeClient.getParticipants, 'function');
  assert.strictEqual(typeof realtimeClient.onStateChange, 'function');

  const indexText = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  assert.strictEqual((indexText.match(/function mountLingoSentinelRoomRoute\(/g) || []).length, 1);
  assert.strictEqual((indexText.match(/function mountLingoSentinelConnectionRoute\(/g) || []).length, 1);
  assert.strictEqual((indexText.match(/const lingoSentinelRoomRouteMounted =/g) || []).length, 1);
  assert.strictEqual((indexText.match(/const lingoSentinelConnectionRouteMounted =/g) || []).length, 1);
  assert(indexText.includes('lingosentinel-public-realtime-client.js'));

  console.log(JSON.stringify({
    ok: true,
    contract: 'nyx.lingosentinel.layers3_4.runtimeTest/1.0',
    checks: 45,
    results: {
      roomPolicy: true,
      oneToOneCap: true,
      crossRoomIsolation: true,
      membershipTokenGate: true,
      gatewayMembershipGate: true,
      connectionTransitions: true,
      boundedReconnects: true,
      authorizationFailureNoLoop: true,
      realtimeProviderBoundary: true,
      publicRealtimeClient: true,
      guardedIndexMounts: true,
      serverVerifiedInvitations: true,
      roomMetadataProtected: true,
      participantSessionsRedacted: true,
      connectionIdentityBound: true
    }
  }, null, 2));
}

run().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
}).finally(() => { Module._load = originalLoad; });

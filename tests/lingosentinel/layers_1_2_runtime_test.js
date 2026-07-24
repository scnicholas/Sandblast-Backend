'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME = path.join(ROOT, 'Data', 'marion', 'runtime', 'LingoSentinel');

function fakeRouter() {
  function router() {}
  router.routes = [];
  for (const method of ['get', 'post', 'options', 'use']) {
    router[method] = function routeRegister(routePath, handler) {
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
        constructor(options) { this.options = options; }
        auth = {
          createTokenRequest: async (input) => ({
            keyName: 'mock.key',
            clientId: input.clientId,
            ttl: input.ttl,
            capability: input.capability,
            nonce: 'mock-nonce',
            timestamp: Date.now(),
            mac: 'mock-mac'
          })
        };
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function run() {
  const policy = require(path.join(RUNTIME, 'LingoSentinelTokenPolicy.js'));

  const first = policy.sanitizeTokenInput({}, {});
  const second = policy.sanitizeTokenInput({}, {});
  assert.notStrictEqual(first.clientId, second.clientId, 'fallback client identities must be unique');
  assert.strictEqual(first.identitySource, 'server_generated');

  const stable = policy.sanitizeTokenInput({ clientId: 'lsu_browser_123456', sessionId: 'lss_tab_123456', displayName: 'Sean' }, {});
  assert.strictEqual(stable.clientId, 'lsu_browser_123456');
  assert.strictEqual(stable.identitySource, 'client_supplied');
  assert.strictEqual(policy.validateTokenInput(stable).ok, true);

  const reserved = policy.sanitizeTokenInput({ clientId: 'marion-admin-user', sessionId: 'lss_tab_reserved', displayName: 'Marion' }, {});
  assert.strictEqual(policy.validateTokenInput(reserved).ok, false, 'reserved identity must be rejected');

  const invalidMode = policy.sanitizeTokenInput({ mode: 'unknown_lane', clientId: 'lsu_valid_123456', sessionId: 'lss_tab_valid_123' }, {});
  assert.strictEqual(policy.validateTokenInput(invalidMode).ok, false, 'unknown modes must not silently downgrade');

  const channel = policy.channelForMode('group_room', 'room-1');
  const capability = policy.buildCapability(channel);
  assert.deepStrictEqual(capability[channel], ['publish', 'subscribe', 'presence']);
  assert.strictEqual(Object.keys(capability).some((key) => /telemetry/i.test(key)), false, 'public telemetry capability must be absent');
  assert.strictEqual(Object.keys(capability).every((key) => key.startsWith(channel)), true, 'capability must remain room-scoped');

  const gateway = require(path.join(RUNTIME, 'LingoSentinelLinkGateway.js'));
  const participant = gateway.normalizeParticipant({
    clientId: 'lsu_browser_123456',
    sessionId: 'lss_tab_123456',
    connectionId: 'conn_123456',
    displayName: 'Sean'
  });
  assert.strictEqual(participant.contract, 'lingosentinel.clientIdentity/1.0');
  assert.strictEqual(participant.clientId, 'lsu_browser_123456');
  assert.strictEqual(participant.sessionId, 'lss_tab_123456');
  assert.strictEqual(participant.displayName, 'Sean');

  process.env.ABLY_ROOT_API_KEY = 'mock-app.mock-key:mock-secret';
  const tokenRoute = require(path.join(RUNTIME, 'LingoSentinelSubscribeTokenRoute.js'));
  const tokenInput = policy.validateTokenInput(policy.sanitizeTokenInput({
    clientId: 'lsu_browser_123456',
    sessionId: 'lss_tab_123456',
    roomId: 'room-1',
    mode: 'group_room'
  }, {})).normalized;
  const tokenResult = await tokenRoute.createTokenRequest(tokenInput);
  assert.strictEqual(tokenResult.channel, 'lingosentinel:room:room-1');
  assert.strictEqual(tokenResult.tokenRequest.clientId, 'lsu_browser_123456');
  assert.strictEqual(Object.keys(JSON.parse(tokenResult.tokenRequest.capability)).some((key) => /telemetry/i.test(key)), false);

  const runtimeHealth = require(path.join(RUNTIME, 'LingoSentinelRuntimeHealth.js'));
  const health = runtimeHealth.buildRuntimeHealth({ rootDir: ROOT });
  assert.strictEqual(health.critical.gatewayReady, true);
  assert.strictEqual(health.critical.tokenPolicyReady, true);
  assert.strictEqual(health.critical.tokenRouteReady, true);
  assert.strictEqual(health.critical.publicAssetsReady, true);
  assert.strictEqual(health.translationRequiredForEnglishRelay, false);
  assert.strictEqual(health.boundaries.secretValuesExposed, false);

  const indexText = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  assert.strictEqual((indexText.match(/function mountLingoSentinelRuntimeHealthRoute\(/g) || []).length, 1);
  assert.strictEqual((indexText.match(/const lingoSentinelRuntimeHealthMounted =/g) || []).length, 1);
  assert(indexText.includes('/api/lingosentinel/runtime/health'));

  const clientCode = fs.readFileSync(path.join(ROOT, 'public', 'lingosentinel', 'lingosentinel-public-translation-client.js'), 'utf8');
  const localData = new Map();
  const sessionData = new Map();
  let capturedBody = null;
  function storage(map) {
    return {
      getItem(key) { return map.has(key) ? map.get(key) : null; },
      setItem(key, value) { map.set(key, String(value)); },
      removeItem(key) { map.delete(key); }
    };
  }
  const window = {
    localStorage: storage(localData),
    sessionStorage: storage(sessionData),
    crypto: require('crypto').webcrypto,
    fetch: async (endpoint, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        status: 200,
        async json() {
          return {
            ok: true,
            tokenRequest: { clientId: capturedBody.clientId, capability: '{}' },
            canonicalChannel: 'lingosentinel:room:room-1',
            mode: capturedBody.mode,
            roomId: capturedBody.roomId,
            ttlMs: 900000,
            identity: {
              contract: 'lingosentinel.clientIdentity/1.0',
              clientId: capturedBody.clientId,
              sessionId: capturedBody.sessionId,
              displayName: capturedBody.displayName,
              role: 'participant'
            }
          };
        }
      };
    }
  };
  const context = vm.createContext({ window, globalThis: window, fetch: window.fetch, TextEncoder, Uint8Array, Map, Set, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error });
  vm.runInContext(clientCode, context, { filename: 'lingosentinel-public-translation-client.js' });
  const browserClient = window.LingoSentinelPublicClient;
  const browserIdentityA = browserClient.getOrCreateIdentity({ displayName: 'Sean' });
  const browserIdentityB = browserClient.getOrCreateIdentity();
  assert.strictEqual(browserIdentityA.clientId, browserIdentityB.clientId, 'browser identity must persist');
  const browserToken = await browserClient.requestRealtimeToken({ mode: 'group_room', roomId: 'room-1' });
  assert.strictEqual(browserToken.ok, true);
  assert.strictEqual(capturedBody.clientId, browserIdentityA.clientId);
  assert(capturedBody.sessionId.startsWith('lss_'));

  console.log(JSON.stringify({
    ok: true,
    contract: 'nyx.lingosentinel.layers1_2.runtimeTest/1.0',
    checks: 27,
    results: {
      uniqueFallbackIdentity: true,
      stableBrowserIdentity: true,
      perTabSessionIdentity: true,
      reservedIdentityBlocked: true,
      invalidModeBlocked: true,
      roomScopedCapability: true,
      telemetryCapabilityRemoved: true,
      gatewayIdentityContract: true,
      tokenPolicyAuthority: true,
      runtimeHealthMountedOnce: true,
      translationIndependentFromEnglishRelay: true,
      secretsRedacted: true
    }
  }, null, 2));
}

run().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});

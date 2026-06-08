'use strict';

/**
 * lingosentinel-engine.test.js
 *
 * Regression coverage for:
 * Data/marion/runtime/LingoSentinel/LingoSentinelEngine.js
 *
 * Confirms:
 * - Engine loads from the dedicated LingoSentinel runtime folder.
 * - Engine consumes gateway-approved input.
 * - Engine publishes nothing during dry-run.
 * - Group Room, Live Translate, Delivered, and 1:1 lanes route correctly.
 * - Private credentials are rejected before realtime handoff.
 * - Ably keys are never exposed in returned payloads.
 * - Mock Ably client receives the expected channel, event, and payload.
 *
 * Critical alignment note:
 * - The active signal-envelope/adaptive layer emits compact Ably namespace `ls:`.
 * - The gateway still remains the authority boundary; this test follows the
 *   active engine output instead of forcing the fallback `lingosentinel:` namespace.
 */

const assert = require('assert');

const Engine = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelEngine');

const ACTIVE_NAMESPACE = 'ls';

const tests = [];

function runTest(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✓ ${test.name}`);
    } catch (error) {
      console.error(`✗ ${test.name}`);
      console.error(error);
      process.exitCode = 1;
    }
  }

  if (process.exitCode) {
    console.error('\nLingoSentinel engine regression tests failed.');
  } else {
    console.log('\nAll LingoSentinel engine regression tests passed.');
  }
}

function channel(lane, id) {
  return `${ACTIVE_NAMESPACE}:${lane}:${id}`;
}

function baseSender(overrides = {}) {
  return {
    id: 'mac-test-user',
    name: 'Mac',
    role: 'owner',
    preferredLanguage: 'en',
    ...overrides
  };
}

function baseRecipient(overrides = {}) {
  return {
    id: 'guest-test-user',
    name: 'Guest',
    role: 'recipient',
    preferredLanguage: 'fr',
    ...overrides
  };
}

function assertNoSecretLeak(value) {
  const text = JSON.stringify(value);
  assert.strictEqual(text.includes('ABLY_ROOT_API_KEY'), false);
  assert.strictEqual(text.includes('ABLY_API_KEY'), false);
  assert.strictEqual(text.includes('fake-live-key'), false);
  assert.strictEqual(text.includes('super-secret'), false);
  assert.strictEqual(text.includes('api_key:'), false);
  assert.strictEqual(text.includes('password:'), false);
}

function createMockAblyClient() {
  const published = [];

  return {
    published,
    connection: {
      state: 'connected',
      on() {},
      off() {},
      removeListener() {}
    },
    channels: {
      get(channelName) {
        return {
          async publish(eventName, payload) {
            published.push({
              channelName,
              eventName,
              payload
            });
          }
        };
      }
    },
    close() {
      published.push({ closed: true });
    }
  };
}

runTest('engine exposes expected contract and public functions', () => {
  assert.strictEqual(typeof Engine.publishMessage, 'function');
  assert.strictEqual(typeof Engine.publishDirectMessage, 'function');
  assert.strictEqual(typeof Engine.publishGroupMessage, 'function');
  assert.strictEqual(typeof Engine.publishLiveTranslateMessage, 'function');
  assert.strictEqual(typeof Engine.publishDeliveredReceipt, 'function');
  assert.strictEqual(typeof Engine.routePreview, 'function');
  assert.strictEqual(typeof Engine.getEngineContract, 'function');

  const contract = Engine.getEngineContract();

  assert.strictEqual(contract.engine, 'LingoSentinelEngine');
  assert.strictEqual(contract.payloadShape, 'lingosentinel.signal');
  assert.strictEqual(contract.boundaries.consumesGatewayApprovedInput, true);
  assert.strictEqual(contract.boundaries.publishesRealtime, true);
  assert.strictEqual(contract.boundaries.performsTranslation, false);
  assert.strictEqual(contract.boundaries.finalAuthority, 'Marion');
  assert.strictEqual(contract.boundaries.exposesAblyKey, false);

  assert.strictEqual(contract.lanes.one_to_one, 'direct');
  assert.strictEqual(contract.lanes.group_room, 'room');
  assert.strictEqual(contract.lanes.live_translate, 'translation');
  assert.strictEqual(contract.lanes.delivered, 'delivered');
});

runTest('group_room dry-run routes to active room channel namespace', async () => {
  const result = await Engine.publishGroupMessage(
    {
      roomId: 'region-japan',
      text: 'Join Japan group room.',
      sender: baseSender(),
      sourceLanguage: 'en',
      targetLanguage: 'ja',
      metadata: {
        region: 'Japan',
        city: 'Tokyo',
        interactionSource: 'globe_click'
      }
    },
    { dryRun: true }
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.stage, 'dry_run');
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.mode, 'group_room');
  assert.strictEqual(result.channel, channel('room', 'region-japan'));
  assert.strictEqual(result.eventName, 'ROOM_MESSAGE_READY');
  assert.strictEqual(result.room.lane, 'room');
  assert.strictEqual(result.room.id, 'region-japan');
  assert.strictEqual(result.governance.marionAuthority, true);
  assert.strictEqual(result.telemetry.payloadShape, 'lingosentinel.signal');
  assertNoSecretLeak(result);
});

runTest('live_translate dry-run routes to active translation channel namespace', async () => {
  const result = await Engine.publishLiveTranslateMessage(
    {
      roomId: 'translation-session-001',
      sessionId: 'translation-session-001',
      text: 'Start live translation.',
      sender: baseSender(),
      sourceLanguage: 'en',
      targetLanguage: 'es',
      metadata: {
        sessionId: 'translation-session-001',
        languagePair: {
          source: 'en',
          target: 'es'
        }
      }
    },
    { dryRun: true }
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.stage, 'dry_run');
  assert.strictEqual(result.mode, 'live_translate');
  assert.strictEqual(result.channel, channel('translation', 'translation-session-001'));
  assert.strictEqual(result.eventName, 'TRANSLATION_MESSAGE_READY');
  assert.strictEqual(result.room.lane, 'translation');
  assert.strictEqual(result.room.sessionId, 'translation-session-001');
  assert.strictEqual(result.language.sourceLanguage || result.language.source, 'en');
  assert.strictEqual(result.language.targetLanguage || result.language.target, 'es');
  assert.strictEqual(result.governance.marionAuthority, true);
  assertNoSecretLeak(result);
});

runTest('delivered dry-run routes to active delivered channel namespace', async () => {
  const result = await Engine.publishDeliveredReceipt(
    {
      roomId: 'delivery-thread-001',
      text: 'Message delivered confirmation.',
      sender: baseSender(),
      recipient: baseRecipient({ preferredLanguage: 'es' }),
      sourceLanguage: 'en',
      recipientLanguage: 'es'
    },
    { dryRun: true }
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.stage, 'dry_run');
  assert.strictEqual(result.mode, 'delivered');
  assert.strictEqual(result.channel, channel('delivered', 'delivery-thread-001'));
  assert.strictEqual(result.eventName, 'DELIVERED_MESSAGE_READY');
  assert.strictEqual(result.room.lane, 'delivered');
  assert.strictEqual(result.room.id, 'delivery-thread-001');
  assert.strictEqual(result.governance.marionAuthority, true);
  assertNoSecretLeak(result);
});

runTest('one_to_one dry-run requires recipient', async () => {
  const result = await Engine.publishDirectMessage(
    {
      roomId: 'direct-thread-001',
      text: 'Direct message without recipient should fail.',
      sender: baseSender(),
      sourceLanguage: 'en',
      targetLanguage: 'fr'
    },
    { dryRun: true }
  );

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.governance.marionAuthority, true);
  assert.ok(
    result.errors.some(error => error.includes('recipient.id')),
    'Expected recipient.id validation error.'
  );
});

runTest('one_to_one dry-run routes to active direct channel namespace when recipient exists', async () => {
  const result = await Engine.publishDirectMessage(
    {
      roomId: 'direct-thread-001',
      text: 'Hello direct recipient.',
      sender: baseSender(),
      recipient: baseRecipient(),
      sourceLanguage: 'en',
      targetLanguage: 'fr'
    },
    { dryRun: true }
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.stage, 'dry_run');
  assert.strictEqual(result.mode, 'one_to_one');
  assert.strictEqual(result.channel, channel('direct', 'direct-thread-001'));
  assert.strictEqual(result.eventName, 'ONE_TO_ONE_MESSAGE_READY');
  assert.strictEqual(result.room.lane, 'direct');
  assert.strictEqual(result.governance.marionAuthority, true);
  assertNoSecretLeak(result);
});

runTest('private credential text is rejected before realtime handoff', async () => {
  const result = await Engine.publishGroupMessage(
    {
      roomId: 'region-security',
      text: 'Here is my api_key: super-secret',
      sender: baseSender(),
      sourceLanguage: 'en',
      targetLanguage: 'multi'
    },
    { dryRun: true }
  );

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.governance.marionAuthority, true);
  assert.strictEqual(result.governance.decision, 'reject');
  assertNoSecretLeak(result);
});

runTest('routePreview returns safe route summary without publishing', () => {
  const preview = Engine.routePreview({
    mode: 'group_room',
    roomId: 'region-trinidad',
    text: 'Open Trinidad and Tobago group room.',
    sender: baseSender(),
    sourceLanguage: 'en',
    targetLanguage: 'multi',
    metadata: {
      region: 'Trinidad and Tobago',
      interactionSource: 'globe_click'
    }
  });

  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.channel, channel('room', 'region-trinidad'));
  assert.strictEqual(preview.eventName, 'ROOM_MESSAGE_READY');
  assert.strictEqual(preview.mode, 'group_room');
  assert.strictEqual(preview.room.lane, 'room');
  assert.strictEqual(preview.governance.marionAuthority, true);
  assert.strictEqual(preview.telemetry.payloadShape, 'lingosentinel.signal');
  assertNoSecretLeak(preview);
});

runTest('buildSignalPlan prepares canonical signal and publish target', () => {
  const plan = Engine.buildSignalPlan({
    mode: 'group_room',
    roomId: 'region-singapore',
    text: 'Join Singapore group room.',
    sender: baseSender(),
    sourceLanguage: 'en',
    targetLanguage: 'multi',
    metadata: {
      region: 'Singapore',
      city: 'Singapore',
      interactionSource: 'globe_click'
    }
  });

  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.publish.channel, channel('room', 'region-singapore'));
  assert.strictEqual(plan.publish.eventName, 'ROOM_MESSAGE_READY');
  assert.strictEqual(plan.signal.schema, 'lingosentinel.signal');
  assert.strictEqual(plan.signal.engine, 'LingoSentinelEngine');
  assert.strictEqual(plan.signal.room.lane, 'room');
  assert.strictEqual(plan.signal.metadata.region, 'Singapore');
  assert.strictEqual(plan.signal.metadata.city, 'Singapore');
  assert.strictEqual(plan.signal.metadata.interactionSource, 'globe_click');
  assert.strictEqual(plan.signal.governance.marionAuthority, true);
  assertNoSecretLeak(plan);
});

runTest('fallbackRoute maps every supported mode to stable fallback lanes', () => {
  const group = Engine.fallbackRoute({ mode: 'group_room', roomId: 'region-canada' });
  assert.strictEqual(group.lane, 'room');
  assert.strictEqual(group.ablyChannel, 'lingosentinel:room:region-canada');
  assert.strictEqual(group.eventType, 'ROOM_MESSAGE_READY');

  const live = Engine.fallbackRoute({
    mode: 'live_translate',
    roomId: 'translation-room',
    sessionId: 'session-123'
  });
  assert.strictEqual(live.lane, 'translation');
  assert.strictEqual(live.ablyChannel, 'lingosentinel:translation:session-123');
  assert.strictEqual(live.eventType, 'TRANSLATION_MESSAGE_READY');

  const delivered = Engine.fallbackRoute({ mode: 'delivered', roomId: 'delivery-thread' });
  assert.strictEqual(delivered.lane, 'delivered');
  assert.strictEqual(delivered.ablyChannel, 'lingosentinel:delivered:delivery-thread');
  assert.strictEqual(delivered.eventType, 'DELIVERED_MESSAGE_READY');

  const direct = Engine.fallbackRoute({ mode: 'one_to_one', roomId: 'direct-thread' });
  assert.strictEqual(direct.lane, 'direct');
  assert.strictEqual(direct.ablyChannel, 'lingosentinel:direct:direct-thread');
  assert.strictEqual(direct.eventType, 'ONE_TO_ONE_MESSAGE_READY');
});

runTest('mock Ably client receives correct active channel, event, and payload', async () => {
  const mockClient = createMockAblyClient();

  const result = await Engine.publishGroupMessage(
    {
      roomId: 'region-france',
      text: 'Bonjour from the group room.',
      sender: baseSender(),
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      metadata: {
        region: 'France',
        city: 'Paris'
      }
    },
    {
      client: mockClient,
      clientId: 'mock-lingosentinel-client'
    }
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.stage, 'published');
  assert.strictEqual(result.channel, channel('room', 'region-france'));
  assert.strictEqual(result.eventName, 'ROOM_MESSAGE_READY');

  assert.strictEqual(mockClient.published.length, 1);
  assert.strictEqual(mockClient.published[0].channelName, channel('room', 'region-france'));
  assert.strictEqual(mockClient.published[0].eventName, 'ROOM_MESSAGE_READY');

  const payload = mockClient.published[0].payload;

  assert.strictEqual(payload.schema, 'lingosentinel.signal');
  assert.strictEqual(payload.engine, 'LingoSentinelEngine');
  assert.strictEqual(payload.mode, 'group_room');
  assert.strictEqual(payload.room.lane, 'room');
  assert.strictEqual(payload.governance.marionAuthority, true);
  assert.strictEqual(payload.metadata.region, 'France');
  assert.strictEqual(payload.metadata.city, 'Paris');

  assertNoSecretLeak(result);
  assertNoSecretLeak(mockClient.published);
});

runTest('publish failure returns sanitized error without exposing key material', async () => {
  const badClient = {
    connection: {
      state: 'connected',
      on() {},
      off() {},
      removeListener() {}
    },
    channels: {
      get() {
        return {
          async publish() {
            const error = new Error('Publish failed with key=fake-live-key token=super-secret');
            error.code = 'MOCK_PUBLISH_FAILURE';
            throw error;
          }
        };
      }
    }
  };

  const result = await Engine.publishGroupMessage(
    {
      roomId: 'region-error',
      text: 'Trigger sanitized failure.',
      sender: baseSender(),
      sourceLanguage: 'en',
      targetLanguage: 'multi'
    },
    {
      client: badClient,
      clientId: 'mock-lingosentinel-client'
    }
  );

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, 'publish_failed');
  assert.strictEqual(result.telemetry.code, 'MOCK_PUBLISH_FAILURE');
  assert.strictEqual(result.errors[0].includes('fake-live-key'), false);
  assert.strictEqual(result.errors[0].includes('super-secret'), false);
  assert.strictEqual(result.errors[0].includes('key=[redacted]'), true);
  assert.strictEqual(result.errors[0].includes('token=[redacted]'), true);
  assertNoSecretLeak(result);
});

runTest('closeEngine and resetEngineForTests return safe lifecycle results', async () => {
  const reset = Engine.resetEngineForTests();
  assert.strictEqual(reset.ok, true);
  assert.strictEqual(reset.engine, 'LingoSentinelEngine');
  assert.ok(reset.resetAt);

  const closed = await Engine.closeEngine();
  assert.strictEqual(closed.ok, true);
  assert.strictEqual(closed.engine, 'LingoSentinelEngine');
  assert.ok(closed.closedAt);
});

runAll();

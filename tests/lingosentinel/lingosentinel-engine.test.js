'use strict';

/**
 * lingosentinel-engine.test.js
 *
 * VERSION_MARKER: LINGOSENTINEL_ENGINE_TEST_V11_DELIVERED_RECEIPT_LANE_FIX
 *
 * Regression coverage for:
 * Data/marion/runtime/LingoSentinel/LingoSentinelEngine.js
 *
 * Current contract:
 * - Active engine path may use the adaptive SignalEnvelope layer:
 *     channels: ls:*
 *     events:   lingosentinel.message.*
 * - Delivered receipts currently publish through the active `receipt` lane:
 *     channel:  ls:receipt:{threadId}
 *     event:    lingosentinel.message.delivered
 * - fallbackRoute() remains the plain fallback helper:
 *     channels: lingosentinel:*
 *     events:   *_MESSAGE_READY
 *
 * Important:
 * - Adaptive payloads, signals, rooms, and previews may not expose old canonical-only
 *   fields such as `room.lane`, `room.mode`, `room.id`, `room.sessionId`,
 *   `preview.mode`, or top-level `schema`.
 * - The stable public publish result contract is:
 *     result.ok
 *     result.stage
 *     result.mode
 *     result.channel
 *     result.eventName
 *     result.governance.marionAuthority
 *     result.telemetry.payloadShape
 * - The stable preview contract is:
 *     preview.ok
 *     preview.channel
 *     preview.eventName
 *     preview.governance.marionAuthority
 *     preview.telemetry.payloadShape
 * - The stable internal planning contract is:
 *     plan.ok
 *     plan.publish.channel
 *     plan.publish.eventName
 *     plan.gateway.ok
 *     plan.gateway.publishInput
 */

const assert = require('assert');

const Engine = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelEngine');

const ACTIVE_EVENTS = Object.freeze({
  group_room: 'lingosentinel.message.group',
  one_to_one: 'lingosentinel.message.direct',
  live_translate: 'lingosentinel.message.translation',
  delivered: 'lingosentinel.message.delivered'
});

function activeChannel(lane, id) {
  return `ls:${lane}:${id}`;
}

function test(name, fn) {
  return { name, fn };
}

async function runAll(tests) {
  for (const item of tests) {
    try {
      await item.fn();
      console.log(`✓ ${item.name}`);
    } catch (error) {
      console.error(`✗ ${item.name}`);
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

function assertPublicSuccess(result, expected) {
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.stage, expected.stage);
  assert.strictEqual(result.mode, expected.mode);
  assert.strictEqual(result.channel, expected.channel);
  assert.strictEqual(result.eventName, expected.eventName);
  assert.ok(result.governance, 'Expected governance object.');
  assert.strictEqual(result.governance.marionAuthority, true);
  assert.ok(result.telemetry, 'Expected telemetry object.');
  assert.strictEqual(result.telemetry.payloadShape, 'lingosentinel.signal');
  assertNoSecretLeak(result);
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

runAll([
  test('loaded v11 test file marker is present', () => {
    assert.strictEqual('LINGOSENTINEL_ENGINE_TEST_V11_DELIVERED_RECEIPT_LANE_FIX'.includes('V11'), true);
  }),

  test('engine exposes expected public contract', () => {
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
    assert.strictEqual(contract.lanes.group_room, 'room');
    assert.strictEqual(contract.lanes.one_to_one, 'direct');
    assert.strictEqual(contract.lanes.live_translate, 'translation');
    assert.strictEqual(contract.lanes.delivered, 'delivered');
  }),

  test('group_room dry-run returns stable public route contract', async () => {
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

    assert.strictEqual(result.dryRun, true);
    assertPublicSuccess(result, {
      stage: 'dry_run',
      mode: 'group_room',
      channel: activeChannel('room', 'region-japan'),
      eventName: ACTIVE_EVENTS.group_room
    });
  }),

  test('live_translate dry-run returns stable public route contract', async () => {
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

    assert.strictEqual(result.dryRun, true);
    assertPublicSuccess(result, {
      stage: 'dry_run',
      mode: 'live_translate',
      channel: activeChannel('translation', 'translation-session-001'),
      eventName: ACTIVE_EVENTS.live_translate
    });
  }),

  test('delivered dry-run returns stable public receipt route contract', async () => {
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

    assert.strictEqual(result.dryRun, true);
    assertPublicSuccess(result, {
      stage: 'dry_run',
      mode: 'delivered',
      channel: activeChannel('receipt', 'delivery-thread-001'),
      eventName: ACTIVE_EVENTS.delivered
    });
  }),

  test('one_to_one rejects missing recipient before realtime handoff', async () => {
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
    assert.ok(result.governance, 'Expected governance on rejection.');
    assert.strictEqual(result.governance.marionAuthority, true);
    assert.ok(
      result.errors.some(error => error.includes('recipient.id')),
      'Expected recipient.id validation error.'
    );
    assertNoSecretLeak(result);
  }),

  test('one_to_one dry-run returns stable public route contract when recipient exists', async () => {
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

    assert.strictEqual(result.dryRun, true);
    assertPublicSuccess(result, {
      stage: 'dry_run',
      mode: 'one_to_one',
      channel: activeChannel('direct', 'direct-thread-001'),
      eventName: ACTIVE_EVENTS.one_to_one
    });
  }),

  test('private credential text is rejected before realtime handoff', async () => {
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
    assert.ok(result.governance, 'Expected governance object.');
    assert.strictEqual(result.governance.marionAuthority, true);
    assert.strictEqual(result.governance.decision, 'reject');
    assertNoSecretLeak(result);
  }),

  test('routePreview returns stable preview contract without publishing', () => {
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
    assert.strictEqual(preview.channel, activeChannel('room', 'region-trinidad'));
    assert.strictEqual(preview.eventName, ACTIVE_EVENTS.group_room);
    assert.ok(preview.governance, 'Expected governance object.');
    assert.strictEqual(preview.governance.marionAuthority, true);
    assert.ok(preview.telemetry, 'Expected telemetry object.');
    assert.strictEqual(preview.telemetry.payloadShape, 'lingosentinel.signal');
    assertNoSecretLeak(preview);
  }),

  test('buildSignalPlan prepares active publish target and gateway-approved route', () => {
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
    assert.ok(plan.publish, 'Expected publish object.');
    assert.strictEqual(plan.publish.channel, activeChannel('room', 'region-singapore'));
    assert.strictEqual(plan.publish.eventName, ACTIVE_EVENTS.group_room);
    assert.ok(plan.gateway && plan.gateway.ok, 'Expected gateway-approved plan.');
    assert.strictEqual(plan.gateway.publishInput.mode, 'group_room');
    assert.strictEqual(plan.gateway.publishInput.roomId, 'region-singapore');
    assert.strictEqual(plan.gateway.governance.marionAuthority, true);
    assert.strictEqual(plan.gateway.publishInput.metadata.region, 'Singapore');
    assert.strictEqual(plan.gateway.publishInput.metadata.city, 'Singapore');
    assert.strictEqual(plan.gateway.publishInput.metadata.interactionSource, 'globe_click');
    assertNoSecretLeak(plan);
  }),

  test('fallbackRoute maps every supported mode to stable fallback lanes', () => {
    const group = Engine.fallbackRoute({
      mode: 'group_room',
      roomId: 'region-canada'
    });

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

    const delivered = Engine.fallbackRoute({
      mode: 'delivered',
      roomId: 'delivery-thread'
    });

    assert.strictEqual(delivered.lane, 'delivered');
    assert.strictEqual(delivered.ablyChannel, 'lingosentinel:delivered:delivery-thread');
    assert.strictEqual(delivered.eventType, 'DELIVERED_MESSAGE_READY');

    const direct = Engine.fallbackRoute({
      mode: 'one_to_one',
      roomId: 'direct-thread'
    });

    assert.strictEqual(direct.lane, 'direct');
    assert.strictEqual(direct.ablyChannel, 'lingosentinel:direct:direct-thread');
    assert.strictEqual(direct.eventType, 'ONE_TO_ONE_MESSAGE_READY');
  }),

  test('mock Ably client receives correct active channel, event, and safe payload', async () => {
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

    assertPublicSuccess(result, {
      stage: 'published',
      mode: 'group_room',
      channel: activeChannel('room', 'region-france'),
      eventName: ACTIVE_EVENTS.group_room
    });

    assert.strictEqual(mockClient.published.length, 1);
    assert.strictEqual(mockClient.published[0].channelName, activeChannel('room', 'region-france'));
    assert.strictEqual(mockClient.published[0].eventName, ACTIVE_EVENTS.group_room);
    assert.ok(mockClient.published[0].payload && typeof mockClient.published[0].payload === 'object');
    assertNoSecretLeak(mockClient.published);
  }),

  test('publish failure returns sanitized error without exposing key material', async () => {
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
  }),

  test('closeEngine and resetEngineForTests return safe lifecycle results', async () => {
    const reset = Engine.resetEngineForTests();
    assert.strictEqual(reset.ok, true);
    assert.strictEqual(reset.engine, 'LingoSentinelEngine');
    assert.ok(reset.resetAt);

    const closed = await Engine.closeEngine();
    assert.strictEqual(closed.ok, true);
    assert.strictEqual(closed.engine, 'LingoSentinelEngine');
    assert.ok(closed.closedAt);
  })
]);

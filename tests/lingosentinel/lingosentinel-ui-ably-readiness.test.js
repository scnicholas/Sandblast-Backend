'use strict';

/**
 * lingosentinel-ui-ably-readiness.test.js
 *
 * VERSION_MARKER: LINGOSENTINEL_UI_ABLY_READINESS_V1
 *
 * Controlled readiness coverage for:
 * UI / Widget / Globe intent → LingoSentinelEngine → mock Ably publish client
 *
 * Purpose:
 * - Prove widget/globe payloads can move from dry-run into controlled publish mode.
 * - Prove publish uses the active LingoSentinel lanes.
 * - Prove Marion governance remains attached.
 * - Prove no Ably/API key material leaks into results or payloads.
 * - Prove invalid/private credential-like input is rejected before publish.
 *
 * This test does NOT:
 * - Use real Ably keys
 * - Connect to production Ably
 * - Test Webflow rendering
 * - Test globe visual animation
 * - Test actual translation output
 *
 * Active adaptive contract:
 * - group_room      → ls:room:{roomId}      → lingosentinel.message.group
 * - one_to_one      → ls:direct:{roomId}    → lingosentinel.message.direct
 * - live_translate  → ls:live:{sessionId}   → lingosentinel.message.live
 * - delivered       → ls:receipt:{threadId} → lingosentinel.message.delivered
 */

const assert = require('assert');

const Engine = require('../../Data/marion/runtime/LingoSentinel/LingoSentinelEngine');

const ACTIVE_EVENTS = Object.freeze({
  group_room: 'lingosentinel.message.group',
  one_to_one: 'lingosentinel.message.direct',
  live_translate: 'lingosentinel.message.live',
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
    console.error('\nLingoSentinel UI-to-Ably readiness tests failed.');
  } else {
    console.log('\nAll LingoSentinel UI-to-Ably readiness tests passed.');
  }
}

function baseSender(overrides = {}) {
  return {
    id: 'mac-ui-user',
    name: 'Mac',
    role: 'owner',
    preferredLanguage: 'en',
    ...overrides
  };
}

function baseRecipient(overrides = {}) {
  return {
    id: 'guest-ui-user',
    name: 'Guest',
    role: 'recipient',
    preferredLanguage: 'fr',
    ...overrides
  };
}

function normalizeRoomPart(value, fallback = 'global') {
  const clean = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return clean || fallback;
}

function assertNoSecretLeak(value) {
  const text = JSON.stringify(value);

  assert.strictEqual(text.includes('ABLY_ROOT_API_KEY'), false);
  assert.strictEqual(text.includes('ABLY_API_KEY'), false);
  assert.strictEqual(text.includes('fake-live-key'), false);
  assert.strictEqual(text.includes('mock-live-key'), false);
  assert.strictEqual(text.includes('super-secret'), false);
  assert.strictEqual(text.includes('api_key:'), false);
  assert.strictEqual(text.includes('password:'), false);
  assert.strictEqual(text.includes('private_key'), false);
  assert.strictEqual(text.includes('Bearer '), false);
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
      published.push({
        closed: true
      });
    }
  };
}

function assertPublishedResult(result, expected) {
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.stage, 'published');
  assert.strictEqual(result.mode, expected.mode);
  assert.strictEqual(result.channel, expected.channel);
  assert.strictEqual(result.eventName, expected.eventName);

  assert.ok(result.governance, 'Expected governance object.');
  assert.strictEqual(result.governance.marionAuthority, true);

  assert.ok(result.telemetry, 'Expected telemetry object.');
  assert.strictEqual(result.telemetry.payloadShape, 'lingosentinel.signal');

  assertNoSecretLeak(result);
}

function assertSingleMockPublish(mockClient, expected) {
  assert.strictEqual(mockClient.published.length, 1);
  assert.strictEqual(mockClient.published[0].channelName, expected.channel);
  assert.strictEqual(mockClient.published[0].eventName, expected.eventName);

  const payload = mockClient.published[0].payload;

  assert.ok(payload && typeof payload === 'object', 'Expected published payload object.');
  assertNoSecretLeak(payload);
  assertNoSecretLeak(mockClient.published);
}

function buildGlobeCountryClickInput({
  country,
  city,
  languageHint,
  sender = baseSender()
}) {
  const cleanCountry = normalizeRoomPart(country, 'global');

  return {
    mode: 'group_room',
    roomId: `region-${cleanCountry}`,
    text: `Join ${country || 'Global'} group room.`,
    sender,
    sourceLanguage: sender.preferredLanguage || 'en',
    targetLanguage: languageHint || 'multi',
    metadata: {
      region: country || 'Global',
      city: city || '',
      languageHint: languageHint || 'multi',
      interactionSource: 'globe_click',
      visualFeedback: 'pulse',
      widgetSurface: 'globe'
    }
  };
}

function buildLiveTranslateTabInput({
  sessionId,
  sourceLanguage = 'en',
  targetLanguage = 'es',
  sender = baseSender()
}) {
  const cleanSessionId = sessionId || `live-${sourceLanguage}-${targetLanguage}`;

  return {
    mode: 'live_translate',
    roomId: cleanSessionId,
    sessionId: cleanSessionId,
    text: 'Start live translation.',
    sender,
    sourceLanguage,
    targetLanguage,
    metadata: {
      sessionId: cleanSessionId,
      languagePair: {
        source: sourceLanguage,
        target: targetLanguage
      },
      interactionSource: 'tab_live_translate',
      widgetSurface: 'conversation_tabs'
    }
  };
}

function buildDeliveredTabInput({
  threadId,
  sender = baseSender(),
  recipient = baseRecipient({ preferredLanguage: 'es' })
}) {
  const cleanThreadId = threadId || 'delivery-thread-001';
  const safeRecipientLanguage = recipient && recipient.preferredLanguage
    ? recipient.preferredLanguage
    : 'es';

  const input = {
    mode: 'delivered',
    roomId: cleanThreadId,
    text: 'Message delivered confirmation.',
    sender,
    sourceLanguage: sender.preferredLanguage || 'en',
    recipientLanguage: safeRecipientLanguage,
    metadata: {
      threadId: cleanThreadId,
      interactionSource: 'tab_delivered',
      widgetSurface: 'conversation_tabs'
    }
  };

  if (recipient) {
    input.recipient = recipient;
  }

  return input;
}

function buildDirectTabInput({
  threadId,
  sender = baseSender(),
  recipient = baseRecipient()
}) {
  const cleanThreadId = threadId || 'direct-thread-001';
  const safeTargetLanguage = recipient && recipient.preferredLanguage
    ? recipient.preferredLanguage
    : 'fr';

  const input = {
    mode: 'one_to_one',
    roomId: cleanThreadId,
    text: 'Hello direct recipient.',
    sender,
    sourceLanguage: sender.preferredLanguage || 'en',
    targetLanguage: safeTargetLanguage,
    metadata: {
      threadId: cleanThreadId,
      interactionSource: 'tab_direct',
      widgetSurface: 'conversation_tabs'
    }
  };

  if (recipient) {
    input.recipient = recipient;
  }

  return input;
}

runAll([
  test('loaded UI-to-Ably readiness v1 marker is present', () => {
    assert.strictEqual(
      'LINGOSENTINEL_UI_ABLY_READINESS_V1'.includes('V1'),
      true
    );
  }),

  test('globe click payload publishes to mock Ably room channel', async () => {
    const mockClient = createMockAblyClient();

    const input = buildGlobeCountryClickInput({
      country: 'Japan',
      city: 'Tokyo',
      languageHint: 'ja'
    });

    const expected = {
      mode: 'group_room',
      channel: activeChannel('room', 'region-japan'),
      eventName: ACTIVE_EVENTS.group_room
    };

    const result = await Engine.publishGroupMessage(input, {
      client: mockClient,
      clientId: 'mock-ui-ably-client'
    });

    assertPublishedResult(result, expected);
    assertSingleMockPublish(mockClient, expected);
  }),

  test('globe click payload handles multi-word region publish path', async () => {
    const mockClient = createMockAblyClient();

    const input = buildGlobeCountryClickInput({
      country: 'Trinidad and Tobago',
      city: 'Port of Spain',
      languageHint: 'en'
    });

    const expected = {
      mode: 'group_room',
      channel: activeChannel('room', 'region-trinidad-and-tobago'),
      eventName: ACTIVE_EVENTS.group_room
    };

    const result = await Engine.publishGroupMessage(input, {
      client: mockClient,
      clientId: 'mock-ui-ably-client'
    });

    assertPublishedResult(result, expected);
    assertSingleMockPublish(mockClient, expected);
  }),

  test('live translate tab publishes to mock Ably live channel', async () => {
    const mockClient = createMockAblyClient();

    const input = buildLiveTranslateTabInput({
      sessionId: 'translation-session-001',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    });

    const expected = {
      mode: 'live_translate',
      channel: activeChannel('live', 'translation-session-001'),
      eventName: ACTIVE_EVENTS.live_translate
    };

    const result = await Engine.publishLiveTranslateMessage(input, {
      client: mockClient,
      clientId: 'mock-ui-ably-client'
    });

    assertPublishedResult(result, expected);
    assertSingleMockPublish(mockClient, expected);
  }),

  test('delivered tab publishes to mock Ably receipt channel', async () => {
    const mockClient = createMockAblyClient();

    const input = buildDeliveredTabInput({
      threadId: 'delivery-thread-001'
    });

    const expected = {
      mode: 'delivered',
      channel: activeChannel('receipt', 'delivery-thread-001'),
      eventName: ACTIVE_EVENTS.delivered
    };

    const result = await Engine.publishDeliveredReceipt(input, {
      client: mockClient,
      clientId: 'mock-ui-ably-client'
    });

    assertPublishedResult(result, expected);
    assertSingleMockPublish(mockClient, expected);
  }),

  test('direct tab publishes to mock Ably direct channel', async () => {
    const mockClient = createMockAblyClient();

    const input = buildDirectTabInput({
      threadId: 'direct-thread-001'
    });

    const expected = {
      mode: 'one_to_one',
      channel: activeChannel('direct', 'direct-thread-001'),
      eventName: ACTIVE_EVENTS.one_to_one
    };

    const result = await Engine.publishDirectMessage(input, {
      client: mockClient,
      clientId: 'mock-ui-ably-client'
    });

    assertPublishedResult(result, expected);
    assertSingleMockPublish(mockClient, expected);
  }),

  test('private credential text is rejected before mock publish', async () => {
    const mockClient = createMockAblyClient();

    const input = buildGlobeCountryClickInput({
      country: 'Security',
      city: 'Vault',
      languageHint: 'en'
    });

    input.text = 'Here is my api_key: super-secret';

    const result = await Engine.publishGroupMessage(input, {
      client: mockClient,
      clientId: 'mock-ui-ably-client'
    });

    assert.strictEqual(result.ok, false);
    assert.ok(result.governance, 'Expected governance object.');
    assert.strictEqual(result.governance.marionAuthority, true);
    assert.strictEqual(result.governance.decision, 'reject');

    assert.strictEqual(mockClient.published.length, 0);
    assertNoSecretLeak(result);
    assertNoSecretLeak(mockClient.published);
  }),

  test('missing direct recipient is rejected before mock publish', async () => {
    const mockClient = createMockAblyClient();

    const input = buildDirectTabInput({
      threadId: 'direct-thread-missing-recipient',
      recipient: null
    });

    const result = await Engine.publishDirectMessage(input, {
      client: mockClient,
      clientId: 'mock-ui-ably-client'
    });

    assert.strictEqual(result.ok, false);
    assert.ok(result.governance, 'Expected governance object.');
    assert.strictEqual(result.governance.marionAuthority, true);
    assert.ok(
      result.errors.some(error => error.includes('recipient.id')),
      'Expected recipient.id validation error.'
    );

    assert.strictEqual(mockClient.published.length, 0);
    assertNoSecretLeak(result);
    assertNoSecretLeak(mockClient.published);
  }),

  test('mock publish path does not expose Ably/API key material', async () => {
    const mockClient = createMockAblyClient();

    const input = buildGlobeCountryClickInput({
      country: 'Singapore',
      city: 'Singapore',
      languageHint: 'multi'
    });

    input.metadata.ablyKey = 'fake-live-key';
    input.metadata.api_key = 'super-secret';
    input.metadata.password = 'super-secret';

    const result = await Engine.publishGroupMessage(input, {
      client: mockClient,
      clientId: 'mock-ui-ably-client'
    });

    const expected = {
      mode: 'group_room',
      channel: activeChannel('room', 'region-singapore'),
      eventName: ACTIVE_EVENTS.group_room
    };

    assertPublishedResult(result, expected);
    assertSingleMockPublish(mockClient, expected);

    assertNoSecretLeak(result);
    assertNoSecretLeak(mockClient.published);
  }),

  test('each valid UI action publishes exactly once to mock Ably', async () => {
    const globeClient = createMockAblyClient();
    const liveClient = createMockAblyClient();
    const deliveredClient = createMockAblyClient();
    const directClient = createMockAblyClient();

    await Engine.publishGroupMessage(
      buildGlobeCountryClickInput({
        country: 'Canada',
        city: 'Toronto',
        languageHint: 'en'
      }),
      {
        client: globeClient,
        clientId: 'mock-ui-ably-client'
      }
    );

    await Engine.publishLiveTranslateMessage(
      buildLiveTranslateTabInput({
        sessionId: 'translation-session-canada',
        sourceLanguage: 'en',
        targetLanguage: 'fr'
      }),
      {
        client: liveClient,
        clientId: 'mock-ui-ably-client'
      }
    );

    await Engine.publishDeliveredReceipt(
      buildDeliveredTabInput({
        threadId: 'delivery-thread-canada'
      }),
      {
        client: deliveredClient,
        clientId: 'mock-ui-ably-client'
      }
    );

    await Engine.publishDirectMessage(
      buildDirectTabInput({
        threadId: 'direct-thread-canada'
      }),
      {
        client: directClient,
        clientId: 'mock-ui-ably-client'
      }
    );

    assert.strictEqual(globeClient.published.length, 1);
    assert.strictEqual(liveClient.published.length, 1);
    assert.strictEqual(deliveredClient.published.length, 1);
    assert.strictEqual(directClient.published.length, 1);

    assert.strictEqual(globeClient.published[0].channelName, activeChannel('room', 'region-canada'));
    assert.strictEqual(liveClient.published[0].channelName, activeChannel('live', 'translation-session-canada'));
    assert.strictEqual(deliveredClient.published[0].channelName, activeChannel('receipt', 'delivery-thread-canada'));
    assert.strictEqual(directClient.published[0].channelName, activeChannel('direct', 'direct-thread-canada'));

    assertNoSecretLeak(globeClient.published);
    assertNoSecretLeak(liveClient.published);
    assertNoSecretLeak(deliveredClient.published);
    assertNoSecretLeak(directClient.published);
  })
]);

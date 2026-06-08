'use strict';

/**
 * lingosentinel-widget-globe-smoke.test.js
 *
 * VERSION_MARKER: LINGOSENTINEL_WIDGET_GLOBE_SMOKE_V2_NULL_RECIPIENT_FIX
 *
 * Smoke coverage for the LingoSentinel widget/globe integration layer.
 *
 * Purpose:
 * - Prove widget/globe actions produce the correct engine-ready input.
 * - Prove globe clicks route to Group Room.
 * - Prove Live Translate tab routes to Live Translate.
 * - Prove Delivered tab routes to receipt/delivered flow.
 * - Prove Direct / 1:1 routes to direct lane.
 *
 * This test does NOT verify:
 * - Real browser rendering
 * - Globe animation
 * - Ably production connection
 * - Marion translation output
 * - CSS/Webflow layout
 *
 * Stable active engine contract:
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
    console.error('\nLingoSentinel widget/globe smoke tests failed.');
  } else {
    console.log('\nAll LingoSentinel widget/globe smoke tests passed.');
  }
}

function baseSender(overrides = {}) {
  return {
    id: 'mac-widget-user',
    name: 'Mac',
    role: 'owner',
    preferredLanguage: 'en',
    ...overrides
  };
}

function baseRecipient(overrides = {}) {
  return {
    id: 'guest-widget-user',
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
  assert.strictEqual(text.includes('api_key:'), false);
  assert.strictEqual(text.includes('password:'), false);
  assert.strictEqual(text.includes('private_key'), false);
  assert.strictEqual(text.includes('super-secret'), false);
}

function assertDryRunResult(result, expected) {
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.stage, 'dry_run');
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.mode, expected.mode);
  assert.strictEqual(result.channel, expected.channel);
  assert.strictEqual(result.eventName, expected.eventName);

  assert.ok(result.governance, 'Expected governance object.');
  assert.strictEqual(result.governance.marionAuthority, true);

  assert.ok(result.telemetry, 'Expected telemetry object.');
  assert.strictEqual(result.telemetry.payloadShape, 'lingosentinel.signal');

  assertNoSecretLeak(result);
}

/**
 * These helpers simulate what the widget/globe should produce.
 * They are deliberately small and dependency-free because this is a smoke layer,
 * not a browser rendering test.
 */

function normalizeRoomPart(value, fallback = 'global') {
  const clean = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return clean || fallback;
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
  test('loaded widget/globe smoke v2 marker is present', () => {
    assert.strictEqual(
      'LINGOSENTINEL_WIDGET_GLOBE_SMOKE_V2_NULL_RECIPIENT_FIX'.includes('V2'),
      true
    );
  }),

  test('globe country click creates group_room engine input', async () => {
    const input = buildGlobeCountryClickInput({
      country: 'Japan',
      city: 'Tokyo',
      languageHint: 'ja'
    });

    assert.strictEqual(input.mode, 'group_room');
    assert.strictEqual(input.roomId, 'region-japan');
    assert.strictEqual(input.metadata.interactionSource, 'globe_click');
    assert.strictEqual(input.metadata.widgetSurface, 'globe');

    const result = await Engine.publishGroupMessage(input, { dryRun: true });

    assertDryRunResult(result, {
      mode: 'group_room',
      channel: activeChannel('room', 'region-japan'),
      eventName: ACTIVE_EVENTS.group_room
    });
  }),

  test('globe country click safely normalizes multi-word country room id', async () => {
    const input = buildGlobeCountryClickInput({
      country: 'Trinidad and Tobago',
      city: 'Port of Spain',
      languageHint: 'en'
    });

    assert.strictEqual(input.mode, 'group_room');
    assert.strictEqual(input.roomId, 'region-trinidad-and-tobago');
    assert.strictEqual(input.metadata.region, 'Trinidad and Tobago');
    assert.strictEqual(input.metadata.city, 'Port of Spain');

    const result = await Engine.publishGroupMessage(input, { dryRun: true });

    assertDryRunResult(result, {
      mode: 'group_room',
      channel: activeChannel('room', 'region-trinidad-and-tobago'),
      eventName: ACTIVE_EVENTS.group_room
    });
  }),

  test('live translate tab creates live_translate engine input', async () => {
    const input = buildLiveTranslateTabInput({
      sessionId: 'translation-session-001',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    });

    assert.strictEqual(input.mode, 'live_translate');
    assert.strictEqual(input.roomId, 'translation-session-001');
    assert.strictEqual(input.sessionId, 'translation-session-001');
    assert.strictEqual(input.metadata.interactionSource, 'tab_live_translate');
    assert.deepStrictEqual(input.metadata.languagePair, {
      source: 'en',
      target: 'es'
    });

    const result = await Engine.publishLiveTranslateMessage(input, { dryRun: true });

    assertDryRunResult(result, {
      mode: 'live_translate',
      channel: activeChannel('live', 'translation-session-001'),
      eventName: ACTIVE_EVENTS.live_translate
    });
  }),

  test('delivered tab creates delivered receipt engine input', async () => {
    const input = buildDeliveredTabInput({
      threadId: 'delivery-thread-001'
    });

    assert.strictEqual(input.mode, 'delivered');
    assert.strictEqual(input.roomId, 'delivery-thread-001');
    assert.strictEqual(input.metadata.interactionSource, 'tab_delivered');

    const result = await Engine.publishDeliveredReceipt(input, { dryRun: true });

    assertDryRunResult(result, {
      mode: 'delivered',
      channel: activeChannel('receipt', 'delivery-thread-001'),
      eventName: ACTIVE_EVENTS.delivered
    });
  }),

  test('direct tab creates one_to_one engine input', async () => {
    const input = buildDirectTabInput({
      threadId: 'direct-thread-001'
    });

    assert.strictEqual(input.mode, 'one_to_one');
    assert.strictEqual(input.roomId, 'direct-thread-001');
    assert.strictEqual(input.metadata.interactionSource, 'tab_direct');
    assert.ok(input.recipient && input.recipient.id, 'Expected recipient for direct mode.');

    const result = await Engine.publishDirectMessage(input, { dryRun: true });

    assertDryRunResult(result, {
      mode: 'one_to_one',
      channel: activeChannel('direct', 'direct-thread-001'),
      eventName: ACTIVE_EVENTS.one_to_one
    });
  }),

  test('direct tab rejects one_to_one input without recipient', async () => {
    const input = buildDirectTabInput({
      threadId: 'direct-thread-missing-recipient',
      recipient: null
    });

    assert.strictEqual(input.mode, 'one_to_one');
    assert.strictEqual(input.recipient, undefined);
    assert.strictEqual(input.targetLanguage, 'fr');

    const result = await Engine.publishDirectMessage(input, { dryRun: true });

    assert.strictEqual(result.ok, false);
    assert.ok(result.governance, 'Expected governance object.');
    assert.strictEqual(result.governance.marionAuthority, true);
    assert.ok(
      result.errors.some(error => error.includes('recipient.id')),
      'Expected recipient.id validation error.'
    );

    assertNoSecretLeak(result);
  }),

  test('widget/globe smoke does not live-publish when dryRun is true', async () => {
    const input = buildGlobeCountryClickInput({
      country: 'Singapore',
      city: 'Singapore',
      languageHint: 'multi'
    });

    const result = await Engine.publishGroupMessage(input, { dryRun: true });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.stage, 'dry_run');
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.channel, activeChannel('room', 'region-singapore'));
    assert.strictEqual(result.eventName, ACTIVE_EVENTS.group_room);

    assertNoSecretLeak(result);
  }),

  test('credential-like widget text is rejected before engine handoff completes', async () => {
    const input = buildGlobeCountryClickInput({
      country: 'Security',
      city: 'Vault',
      languageHint: 'en'
    });

    input.text = 'Here is my api_key: super-secret';

    const result = await Engine.publishGroupMessage(input, { dryRun: true });

    assert.strictEqual(result.ok, false);
    assert.ok(result.governance, 'Expected governance object.');
    assert.strictEqual(result.governance.marionAuthority, true);
    assert.strictEqual(result.governance.decision, 'reject');

    assertNoSecretLeak(result);
  })
]);

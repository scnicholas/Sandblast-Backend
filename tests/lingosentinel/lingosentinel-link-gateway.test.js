'use strict';

/**
 * lingosentinel-link-gateway.test.js
 *
 * Regression coverage for:
 * Data/marion/runtime/LingoSentinelLinkGateway.js
 *
 * Confirms:
 * - Marion authority boundary remains intact.
 * - Gateway prepares publish input but does not publish to Ably.
 * - one_to_one, group_room, live_translate, and delivered modes route cleanly.
 * - Realtime route metadata is prepared for the bridge/engine only.
 * - Private/secrets content and sensitive metadata are blocked or stripped before handoff.
 * - Route preview remains safe and testable.
 */

const assert = require('assert');

const {
  prepareLingoSentinelPublish,
  routePreview,
  getGatewayContract,
  normalizeMode,
  normalizeLanguage,
  normalizeLanguagePair,
  normalizeParticipant,
  normalizeRecipient,
  normalizeRoomId,
  validateGatewayInput,
  buildGovernance,
  buildRoute,
  buildPublishInput,
  detectRiskLevel,
  detectPrivateMaterial,
  stripSensitiveMetadata,
  VALID_MODES,
  CHANNEL_LANES,
  EVENT_TYPES
} = require('../../Data/marion/runtime/LingoSentinelLinkGateway');

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
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

runTest('gateway contract exposes stable modes, lanes, event types, and boundaries', () => {
  const contract = getGatewayContract();

  assert.strictEqual(contract.gateway, 'LingoSentinelLinkGateway');
  assert.ok(contract.version, 'Expected gateway version.');
  assert.deepStrictEqual(contract.validModes, VALID_MODES);
  assert.deepStrictEqual(contract.lanes, CHANNEL_LANES);
  assert.deepStrictEqual(contract.eventTypes, EVENT_TYPES);
  assert.strictEqual(contract.boundaries.publishesRealtime, false);
  assert.strictEqual(contract.boundaries.performsTranslation, false);
  assert.strictEqual(contract.boundaries.finalAuthority, 'Marion');
});

runTest('normalizes mode aliases into canonical gateway modes and rejects unknown modes', () => {
  assert.strictEqual(normalizeMode('one'), 'one_to_one');
  assert.strictEqual(normalizeMode('dm'), 'one_to_one');
  assert.strictEqual(normalizeMode('group'), 'group_room');
  assert.strictEqual(normalizeMode('room'), 'group_room');
  assert.strictEqual(normalizeMode('live'), 'live_translate');
  assert.strictEqual(normalizeMode('translate'), 'live_translate');
  assert.strictEqual(normalizeMode('delivery'), 'delivered');
  assert.strictEqual(normalizeMode('unknown_mode'), null);
});

runTest('normalizes language safely with fallback', () => {
  assert.strictEqual(normalizeLanguage('EN'), 'en');
  assert.strictEqual(normalizeLanguage(' Fr '), 'fr');
  assert.strictEqual(normalizeLanguage(''), 'en');
  assert.strictEqual(normalizeLanguage(null), 'en');
});

runTest('normalizes language pairs from source and target fields', () => {
  assert.deepStrictEqual(
    normalizeLanguagePair({ source: 'EN', target: 'JA' }),
    { source: 'en', target: 'ja' }
  );
  assert.deepStrictEqual(
    normalizeLanguagePair({ from: 'fr', to: 'es' }),
    { source: 'fr', target: 'es' }
  );
  assert.strictEqual(normalizeLanguagePair({ source: 'en' }), null);
  assert.strictEqual(normalizeLanguagePair(null), null);
});

runTest('normalizes sender participant shape', () => {
  const participant = normalizeParticipant({
    userId: 'user-123',
    displayName: 'Creator One',
    lang: 'es'
  });

  assert.strictEqual(participant.id, 'user-123');
  assert.strictEqual(participant.name, 'Creator One');
  assert.strictEqual(participant.role, 'participant');
  assert.strictEqual(participant.preferredLanguage, 'es');
  assert.strictEqual(participant.anonymous, false);
});

runTest('normalizes recipient or returns null when absent', () => {
  const recipient = normalizeRecipient({
    id: 'recipient-123',
    name: 'Recipient One',
    preferredLanguage: 'ja'
  });

  assert.strictEqual(recipient.id, 'recipient-123');
  assert.strictEqual(recipient.name, 'Recipient One');
  assert.strictEqual(recipient.role, 'recipient');
  assert.strictEqual(recipient.preferredLanguage, 'ja');
  assert.strictEqual(normalizeRecipient(null), null);
});

runTest('normalizes room ids with safe defaults by mode', () => {
  assert.strictEqual(normalizeRoomId({ mode: 'group_room' }), 'lingosentinel-main');
  assert.strictEqual(normalizeRoomId({ mode: 'live_translate' }), 'translation-session');
  assert.strictEqual(normalizeRoomId({ mode: 'delivered' }), 'delivered-thread');
  assert.strictEqual(normalizeRoomId({ mode: 'group_room', roomId: 'Japan Room 01' }), 'Japan-Room-01');
});

runTest('validates one_to_one mode requires recipient', () => {
  const result = validateGatewayInput({
    mode: 'one_to_one',
    roomId: 'direct-room-001',
    text: 'Hello there.',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(error => error.includes('recipient.id')),
    'Expected recipient.id validation error.'
  );
});

runTest('validates unknown mode as invalid instead of silently routing', () => {
  const result = validateGatewayInput({
    mode: 'unknown_mode',
    roomId: 'region-global',
    text: 'Unknown mode should not route.',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(error => error.includes('Invalid LingoSentinel mode')),
    'Expected invalid mode validation error.'
  );
});

runTest('prepares valid one_to_one publish input', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'one_to_one',
    roomId: 'direct-room-001',
    text: 'Hello from LingoSentinel.',
    sender: baseSender(),
    recipient: baseRecipient(),
    sourceLanguage: 'en',
    targetLanguage: 'fr'
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publishInput.mode, 'one_to_one');
  assert.strictEqual(result.publishInput.roomId, 'direct-room-001');
  assert.strictEqual(result.publishInput.sender.id, 'mac-test-user');
  assert.strictEqual(result.publishInput.recipient.id, 'guest-test-user');
  assert.strictEqual(result.publishInput.sourceLanguage, 'en');
  assert.strictEqual(result.publishInput.targetLanguage, 'fr');
  assert.deepStrictEqual(result.publishInput.languagePair, { source: 'en', target: 'fr' });
  assert.strictEqual(result.publishInput.route.lane, 'direct');
  assert.strictEqual(result.publishInput.route.eventType, 'ONE_TO_ONE_MESSAGE_READY');
  assert.strictEqual(result.publishInput.route.ablyChannel, 'lingosentinel:direct:direct-room-001');
  assert.strictEqual(result.governance.marionAuthority, true);
  assert.strictEqual(result.governance.nyxPublicFacing, true);
  assert.strictEqual(result.governance.decision, 'allow');
  assert.strictEqual(result.telemetry.stage, 'gateway_ready');
});

runTest('prepares group_room publish input without recipient and with default room fallback', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    text: 'Join the default group room.',
    sender: baseSender(),
    sourceLanguage: 'en',
    targetLanguage: 'multi'
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publishInput.mode, 'group_room');
  assert.strictEqual(result.publishInput.roomId, 'lingosentinel-main');
  assert.strictEqual(result.publishInput.recipient, null);
  assert.strictEqual(result.publishInput.targetLanguage, 'multi');
  assert.strictEqual(result.publishInput.route.lane, 'room');
  assert.strictEqual(result.publishInput.route.eventType, 'ROOM_MESSAGE_READY');
  assert.strictEqual(result.publishInput.route.ablyChannel, 'lingosentinel:room:lingosentinel-main');
});

runTest('passes globe click metadata through gateway safely', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-japan',
    text: 'Join the Japan group room.',
    sender: baseSender(),
    sourceLanguage: 'en',
    targetLanguage: 'ja',
    region: 'Japan',
    languageHint: 'ja',
    metadata: {
      region: 'Japan',
      city: 'Tokyo',
      interactionSource: 'globe_click',
      visualFeedback: 'pulse'
    }
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publishInput.mode, 'group_room');
  assert.strictEqual(result.publishInput.roomId, 'region-japan');
  assert.strictEqual(result.publishInput.metadata.gateway, 'LingoSentinelLinkGateway');
  assert.strictEqual(result.publishInput.metadata.region, 'Japan');
  assert.strictEqual(result.publishInput.metadata.city, 'Tokyo');
  assert.strictEqual(result.publishInput.metadata.interactionSource, 'globe_click');
  assert.strictEqual(result.publishInput.metadata.visualFeedback, 'pulse');
  assert.deepStrictEqual(result.publishInput.route.globeContext, {
    region: 'japan',
    languageHint: 'ja'
  });
});

runTest('prepares live_translate publish input with session route', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'live_translate',
    roomId: 'translation-session-001',
    sessionId: 'translation-session-001',
    text: 'Start live translation.',
    sender: baseSender({ preferredLanguage: 'en' }),
    sourceLanguage: 'en',
    targetLanguage: 'es',
    metadata: {
      sessionId: 'translation-session-001'
    }
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publishInput.mode, 'live_translate');
  assert.strictEqual(result.publishInput.roomId, 'translation-session-001');
  assert.deepStrictEqual(result.publishInput.languagePair, { source: 'en', target: 'es' });
  assert.strictEqual(result.publishInput.route.lane, 'translation');
  assert.strictEqual(result.publishInput.route.eventType, 'TRANSLATION_MESSAGE_READY');
  assert.strictEqual(result.publishInput.route.sessionId, 'translation-session-001');
  assert.strictEqual(result.publishInput.route.ablyChannel, 'lingosentinel:translation:translation-session-001');
});

runTest('rejects live_translate input when language pair is missing', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'live_translate',
    roomId: 'translation-session-002',
    text: 'Start live translation without target language.',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(error => error.includes('live_translate mode requires')),
    'Expected live_translate language pair validation error.'
  );
});

runTest('prepares delivered mode as safe async delivery payload', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'delivered',
    roomId: 'delivery-thread-001',
    text: 'Message delivered confirmation.',
    sender: baseSender(),
    recipient: baseRecipient({ preferredLanguage: 'es' }),
    sourceLanguage: 'en',
    recipientLanguage: 'es'
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publishInput.mode, 'delivered');
  assert.strictEqual(result.publishInput.roomId, 'delivery-thread-001');
  assert.strictEqual(result.publishInput.recipientLanguage, 'es');
  assert.strictEqual(result.publishInput.route.lane, 'delivered');
  assert.strictEqual(result.publishInput.route.eventType, 'DELIVERED_MESSAGE_READY');
  assert.strictEqual(result.publishInput.route.ablyChannel, 'lingosentinel:delivered:delivery-thread-001');
  assert.strictEqual(result.governance.decision, 'allow');
});

runTest('rejects empty message text', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-canada',
    text: '',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(error => error.includes('Message text is required')),
    'Expected missing message validation error.'
  );
  assert.strictEqual(result.governance.decision, 'reject');
});

runTest('allows missing group_room roomId by using the default room', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    text: 'Missing explicit room id should use default group room.',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publishInput.roomId, 'lingosentinel-main');
  assert.strictEqual(result.publishInput.route.ablyChannel, 'lingosentinel:room:lingosentinel-main');
});

runTest('rejects missing sender id during validation', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-global',
    text: 'Missing sender id.',
    sender: {
      name: 'Anonymous User'
    }
  });

  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(error => error.includes('sender.id is required')),
    'Expected missing sender.id validation error.'
  );
});

runTest('detects explicit private material in message body', () => {
  assert.strictEqual(detectPrivateMaterial('Here is my api_key: abc123'), true);
  assert.strictEqual(detectPrivateMaterial('My password is hunter2.'), true);
  assert.strictEqual(detectPrivateMaterial('private_key should never be posted here.'), true);
  assert.strictEqual(detectPrivateMaterial('Use bearer abcdefghijklmnop for this request'), true);
  assert.strictEqual(detectPrivateMaterial('This is a normal multilingual message.'), false);
});

runTest('assigns risk levels correctly', () => {
  assert.strictEqual(detectRiskLevel({ text: 'Normal room message.' }), 'low');
  assert.strictEqual(detectRiskLevel({ text: 'This is urgent and critical.' }), 'medium');
  assert.strictEqual(detectRiskLevel({ text: 'My password is hunter2.' }), 'high');
});

runTest('rejects explicit private credential content before publish handoff', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-security',
    text: 'My api_key is abc123.',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.governance.marionAuthority, true);
  assert.strictEqual(result.governance.decision, 'reject');
  assert.strictEqual(result.governance.riskLevel, 'high');
  assert.strictEqual(result.governance.privateMaterial, true);
  assert.ok(
    result.errors.some(error => error.includes('governance')),
    'Expected governance rejection error.'
  );
});

runTest('medium-risk content is allowed with review', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-alerts',
    text: 'There is an urgent translation issue in the group room.',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.governance.decision, 'allow_with_review');
  assert.strictEqual(result.governance.requiresReview, true);
  assert.strictEqual(result.governance.riskLevel, 'medium');
  assert.strictEqual(result.publishInput.metadata.riskLevel, 'medium');
});

runTest('buildGovernance keeps Marion authority and boundary flags true', () => {
  const governance = buildGovernance(
    { text: 'Normal LingoSentinel message.' },
    { text: 'Normal LingoSentinel message.' }
  );

  assert.strictEqual(governance.marionAuthority, true);
  assert.strictEqual(governance.nyxPublicFacing, true);
  assert.strictEqual(governance.lingoSentinelAllowed, true);
  assert.strictEqual(governance.decision, 'allow');
  assert.strictEqual(governance.boundaries.publishesRealtime, false);
  assert.strictEqual(governance.boundaries.performsTranslation, false);
  assert.strictEqual(governance.boundaries.finalAuthority, 'Marion');
});

runTest('stripSensitiveMetadata removes private fields while keeping safe globe context', () => {
  const metadata = stripSensitiveMetadata({
    region: 'Singapore',
    city: 'Singapore',
    interactionSource: 'globe_click',
    email: 'person@example.com',
    password: 'do-not-send',
    api_key: 'do-not-send',
    token: 'do-not-send'
  });

  assert.strictEqual(metadata.region, 'Singapore');
  assert.strictEqual(metadata.city, 'Singapore');
  assert.strictEqual(metadata.interactionSource, 'globe_click');
  assert.strictEqual(metadata.email, undefined);
  assert.strictEqual(metadata.password, undefined);
  assert.strictEqual(metadata.api_key, undefined);
  assert.strictEqual(metadata.token, undefined);
});

runTest('buildRoute prepares realtime route without publishing', () => {
  const route = buildRoute(
    { sessionId: 'translation-session-007', languageHint: 'fr' },
    {
      mode: 'live_translate',
      roomId: 'translation-session-007',
      region: 'canada'
    }
  );

  assert.strictEqual(route.lane, 'translation');
  assert.strictEqual(route.eventType, 'TRANSLATION_MESSAGE_READY');
  assert.strictEqual(route.sessionId, 'translation-session-007');
  assert.strictEqual(route.ablyChannel, 'lingosentinel:translation:translation-session-007');
  assert.deepStrictEqual(route.globeContext, { region: 'canada', languageHint: 'fr' });
});

runTest('buildPublishInput adds gateway metadata, route, and governance decision', () => {
  const normalized = {
    mode: 'group_room',
    text: 'Hello group.',
    roomId: 'region-france',
    sender: baseSender(),
    recipient: null,
    languagePair: null,
    region: 'france'
  };

  const governance = {
    decision: 'allow',
    riskLevel: 'low'
  };

  const publishInput = buildPublishInput(
    {
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      languageHint: 'fr',
      metadata: {
        region: 'France',
        email: 'blocked@example.com'
      }
    },
    normalized,
    governance
  );

  assert.strictEqual(publishInput.mode, 'group_room');
  assert.strictEqual(publishInput.roomId, 'region-france');
  assert.strictEqual(publishInput.sourceLanguage, 'en');
  assert.strictEqual(publishInput.targetLanguage, 'fr');
  assert.strictEqual(publishInput.metadata.gateway, 'LingoSentinelLinkGateway');
  assert.ok(publishInput.metadata.gatewayVersion, 'Expected gateway version metadata.');
  assert.strictEqual(publishInput.metadata.governanceDecision, 'allow');
  assert.strictEqual(publishInput.metadata.riskLevel, 'low');
  assert.strictEqual(publishInput.metadata.region, 'France');
  assert.strictEqual(publishInput.metadata.email, undefined);
  assert.strictEqual(publishInput.metadata.realtimeReady, true);
  assert.strictEqual(publishInput.route.ablyChannel, 'lingosentinel:room:region-france');
});

runTest('routePreview returns safe route summary', () => {
  const preview = routePreview({
    mode: 'group_room',
    roomId: 'region-trinidad',
    text: 'Open Trinidad and Tobago group room.',
    sender: baseSender(),
    sourceLanguage: 'en',
    targetLanguage: 'multi'
  });

  assert.strictEqual(preview.ok, true);
  assert.strictEqual(preview.mode, 'group_room');
  assert.strictEqual(preview.roomId, 'region-trinidad');
  assert.strictEqual(preview.lane, 'room');
  assert.strictEqual(preview.eventType, 'ROOM_MESSAGE_READY');
  assert.strictEqual(preview.ablyChannel, 'lingosentinel:room:region-trinidad');
  assert.strictEqual(preview.sender, 'mac-test-user');
  assert.strictEqual(preview.recipient, null);
  assert.strictEqual(preview.governance.marionAuthority, true);
  assert.strictEqual(preview.telemetry.stage, 'gateway_ready');
});

runTest('gateway result does not expose Ably publishing behavior', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-global',
    text: 'Gateway should prepare only.',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(typeof result.publishInput, 'object');
  assert.strictEqual(result.publish, undefined);
  assert.strictEqual(result.ably, undefined);
  assert.strictEqual(result.channel, undefined);
  assert.strictEqual(result.client, undefined);
  assert.strictEqual(result.publishInput.governance.boundaries.publishesRealtime, false);
});

runTest('all gateway telemetry includes traceId, version, lane, eventType, and timestamp', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-global',
    text: 'Telemetry check.',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, true);
  assert.ok(result.telemetry.traceId, 'Expected traceId.');
  assert.ok(result.telemetry.timestamp, 'Expected timestamp.');
  assert.ok(result.telemetry.version, 'Expected gateway version.');
  assert.strictEqual(result.telemetry.stage, 'gateway_ready');
  assert.strictEqual(result.telemetry.lane, 'room');
  assert.strictEqual(result.telemetry.eventType, 'ROOM_MESSAGE_READY');
});

if (process.exitCode) {
  console.error('\nLingoSentinel link gateway regression tests failed.');
} else {
  console.log('\nAll LingoSentinel link gateway regression tests passed.');
}

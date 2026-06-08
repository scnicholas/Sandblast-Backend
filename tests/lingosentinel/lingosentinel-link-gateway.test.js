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
 * - Private/secrets content is rejected before realtime handoff.
 * - Route preview remains safe and testable.
 */

const assert = require('assert');

const {
  prepareLingoSentinelPublish,
  routePreview,
  normalizeMode,
  normalizeLanguage,
  normalizeParticipant,
  normalizeRecipient,
  validateGatewayInput,
  buildGovernance,
  buildPublishInput,
  detectRiskLevel,
  detectPrivateMaterial
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

runTest('normalizes mode aliases into canonical gateway modes', () => {
  assert.strictEqual(normalizeMode('one'), 'one_to_one');
  assert.strictEqual(normalizeMode('dm'), 'one_to_one');
  assert.strictEqual(normalizeMode('group'), 'group_room');
  assert.strictEqual(normalizeMode('room'), 'group_room');
  assert.strictEqual(normalizeMode('live'), 'live_translate');
  assert.strictEqual(normalizeMode('translate'), 'live_translate');
  assert.strictEqual(normalizeMode('delivery'), 'delivered');
  assert.strictEqual(normalizeMode('unknown_mode'), 'one_to_one');
});

runTest('normalizes language safely with fallback', () => {
  assert.strictEqual(normalizeLanguage('EN'), 'en');
  assert.strictEqual(normalizeLanguage(' Fr '), 'fr');
  assert.strictEqual(normalizeLanguage(''), 'en');
  assert.strictEqual(normalizeLanguage(null), 'en');
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

  assert.strictEqual(result.governance.marionAuthority, true);
  assert.strictEqual(result.governance.nyxPublicFacing, true);
  assert.strictEqual(result.governance.decision, 'allow');
  assert.strictEqual(result.telemetry.stage, 'gateway_ready');
});

runTest('prepares group_room publish input without recipient', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-japan',
    text: 'Join the Japan group room.',
    sender: baseSender(),
    sourceLanguage: 'en',
    targetLanguage: 'ja',
    metadata: {
      region: 'Japan',
      city: 'Tokyo',
      interactionSource: 'globe_click'
    }
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publishInput.mode, 'group_room');
  assert.strictEqual(result.publishInput.roomId, 'region-japan');
  assert.strictEqual(result.publishInput.recipient, null);
  assert.strictEqual(result.publishInput.targetLanguage, 'ja');

  assert.strictEqual(result.publishInput.metadata.gateway, 'LingoSentinelLinkGateway');
  assert.strictEqual(result.publishInput.metadata.region, 'Japan');
  assert.strictEqual(result.publishInput.metadata.city, 'Tokyo');
  assert.strictEqual(result.publishInput.metadata.interactionSource, 'globe_click');
});

runTest('prepares live_translate publish input with multilingual target', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'live_translate',
    roomId: 'translation-session-001',
    text: 'Start live translation.',
    sender: baseSender({
      preferredLanguage: 'en'
    }),
    sourceLanguage: 'en',
    targetLanguage: 'multi',
    metadata: {
      sessionId: 'translation-session-001',
      languagePair: {
        source: 'en',
        target: 'es'
      }
    }
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publishInput.mode, 'live_translate');
  assert.strictEqual(result.publishInput.roomId, 'translation-session-001');
  assert.strictEqual(result.publishInput.targetLanguage, 'multi');
  assert.strictEqual(result.publishInput.metadata.sessionId, 'translation-session-001');
});

runTest('prepares delivered mode as safe async delivery payload', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'delivered',
    roomId: 'delivery-thread-001',
    text: 'Message delivered confirmation.',
    sender: baseSender(),
    recipient: baseRecipient({
      preferredLanguage: 'es'
    }),
    sourceLanguage: 'en',
    recipientLanguage: 'es'
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publishInput.mode, 'delivered');
  assert.strictEqual(result.publishInput.roomId, 'delivery-thread-001');
  assert.strictEqual(result.publishInput.recipientLanguage, 'es');
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

runTest('rejects missing roomId during validation', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    text: 'Missing room id.',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(error => error.includes('roomId is required')),
    'Expected missing roomId validation error.'
  );
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

runTest('detects private material in message body', () => {
  assert.strictEqual(
    detectPrivateMaterial('Here is my api_key: abc123'),
    true
  );

  assert.strictEqual(
    detectPrivateMaterial('Use bearer abc.def.ghi for this request'),
    true
  );

  assert.strictEqual(
    detectPrivateMaterial('This is a normal multilingual message.'),
    false
  );
});

runTest('assigns risk levels correctly', () => {
  assert.strictEqual(
    detectRiskLevel({ text: 'Normal room message.' }),
    'low'
  );

  assert.strictEqual(
    detectRiskLevel({ text: 'This is urgent and critical.' }),
    'medium'
  );

  assert.strictEqual(
    detectRiskLevel({ text: 'My password is hunter2.' }),
    'high'
  );
});

runTest('rejects private token/API-key content before publish handoff', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-security',
    text: 'My secret token is abc123.',
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

runTest('buildGovernance keeps Marion authority true', () => {
  const governance = buildGovernance(
    { text: 'Normal LingoSentinel message.' },
    { text: 'Normal LingoSentinel message.' }
  );

  assert.strictEqual(governance.marionAuthority, true);
  assert.strictEqual(governance.nyxPublicFacing, true);
  assert.strictEqual(governance.lingoSentinelAllowed, true);
  assert.strictEqual(governance.decision, 'allow');
});

runTest('buildPublishInput adds gateway metadata and governance decision', () => {
  const normalized = {
    mode: 'group_room',
    text: 'Hello group.',
    roomId: 'region-france',
    sender: baseSender(),
    recipient: null
  };

  const governance = {
    decision: 'allow',
    riskLevel: 'low'
  };

  const publishInput = buildPublishInput(
    {
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      metadata: {
        region: 'France'
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
  assert.strictEqual(publishInput.metadata.governanceDecision, 'allow');
  assert.strictEqual(publishInput.metadata.riskLevel, 'low');
  assert.strictEqual(publishInput.metadata.region, 'France');
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
});

runTest('globe click metadata passes through gateway safely', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-singapore',
    text: 'Join Singapore room.',
    sender: baseSender(),
    sourceLanguage: 'en',
    targetLanguage: 'multi',
    metadata: {
      region: 'Singapore',
      city: 'Singapore',
      interactionSource: 'globe_click',
      visualFeedback: 'pulse'
    }
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.publishInput.metadata.region, 'Singapore');
  assert.strictEqual(result.publishInput.metadata.city, 'Singapore');
  assert.strictEqual(result.publishInput.metadata.interactionSource, 'globe_click');
  assert.strictEqual(result.publishInput.metadata.visualFeedback, 'pulse');
});

runTest('all gateway telemetry includes traceId and timestamp', () => {
  const result = prepareLingoSentinelPublish({
    mode: 'group_room',
    roomId: 'region-global',
    text: 'Telemetry check.',
    sender: baseSender()
  });

  assert.strictEqual(result.ok, true);
  assert.ok(result.telemetry.traceId, 'Expected traceId.');
  assert.ok(result.telemetry.timestamp, 'Expected timestamp.');
  assert.strictEqual(result.telemetry.stage, 'gateway_ready');
});

if (process.exitCode) {
  console.error('\nLingoSentinel link gateway regression tests failed.');
} else {
  console.log('\nAll LingoSentinel link gateway regression tests passed.');
}

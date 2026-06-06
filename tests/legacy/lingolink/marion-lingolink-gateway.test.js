'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runMarionLingoLinkGateway,
  createFallbackGatewayResult,
  mapRouteToMode
} = require('../../Data/marion/runtime/MarionLingoLinkGateway');

test('maps route to LingoLink mode', () => {
  assert.equal(mapRouteToMode('LINGOLINK_TRANSLATE'), 'translate');
  assert.equal(mapRouteToMode('LINGOLINK_ADAPT'), 'adapt');
  assert.equal(mapRouteToMode('LINGOLINK_LEARNING'), 'learn');
  assert.equal(mapRouteToMode('LINGOLINK_DETECT'), 'detect');
  assert.equal(mapRouteToMode('LINGOLINK_UNKNOWN_LANGUAGE'), 'translate');
});

test('returns fallback result for empty gateway input', async () => {
  const result = await runMarionLingoLinkGateway('');

  assert.equal(result.ok, false);
  assert.equal(result.gateway, 'marion-lingolink');
  assert.equal(result.marionFinalAuthority, true);
  assert.equal(result.routed, false);
  assert.ok(Array.isArray(result.warnings));
});

test('keeps normal English input inside Marion', async () => {
  const result = await runMarionLingoLinkGateway({
    text: 'Tell me about Sandblast Channel.',
    requestId: 'gateway_marion_only_1'
  });

  assert.equal(result.ok, true);
  assert.equal(result.routed, false);
  assert.equal(result.route, 'MARION_ONLY');
  assert.equal(result.finalText, 'Tell me about Sandblast Channel.');
  assert.equal(result.marionFinalAuthority, true);
  assert.equal(result.telemetry.ok, true);
});

test('routes explicit translation request through LingoLink path', async () => {
  const result = await runMarionLingoLinkGateway({
    text: 'Translate hello into French.',
    requestId: 'gateway_translate_1'
  });

  assert.equal(result.gateway, 'marion-lingolink');
  assert.equal(result.routed, true);
  assert.equal(result.route, 'LINGOLINK_TRANSLATE');
  assert.equal(result.marionFinalAuthority, true);
  assert.equal(result.telemetry.ok, true);
  assert.equal(typeof result.ok, 'boolean');
});

test('routes adaptation request through LingoLink path', async () => {
  const result = await runMarionLingoLinkGateway({
    text: 'Adapt this message for a Spanish audience.',
    requestId: 'gateway_adapt_1'
  });

  assert.equal(result.gateway, 'marion-lingolink');
  assert.equal(result.routed, true);
  assert.equal(result.route, 'LINGOLINK_ADAPT');
  assert.equal(result.marionFinalAuthority, true);
  assert.equal(result.telemetry.ok, true);
});

test('routes language learning request through LingoLink path', async () => {
  const result = await runMarionLingoLinkGateway({
    text: 'Teach me how to say good morning in French.',
    requestId: 'gateway_learn_1'
  });

  assert.equal(result.gateway, 'marion-lingolink');
  assert.equal(result.routed, true);
  assert.equal(result.route, 'LINGOLINK_LEARNING');
  assert.equal(result.marionFinalAuthority, true);
});

test('routes language detection request through LingoLink path', async () => {
  const result = await runMarionLingoLinkGateway({
    text: 'What language is this: bonjour mon ami?',
    requestId: 'gateway_detect_1'
  });

  assert.equal(result.gateway, 'marion-lingolink');
  assert.equal(result.routed, true);
  assert.equal(result.route, 'LINGOLINK_DETECT');
  assert.equal(result.marionFinalAuthority, true);
});

test('creates fallback gateway result directly', () => {
  const result = createFallbackGatewayResult({
    requestId: 'fallback_direct_1',
    reason: 'Manual fallback test.',
    route: 'LINGOLINK_FALLBACK'
  });

  assert.equal(result.ok, false);
  assert.equal(result.requestId, 'fallback_direct_1');
  assert.equal(result.reason, 'Manual fallback test.');
  assert.equal(result.marionFinalAuthority, true);
});

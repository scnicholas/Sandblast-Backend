'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EVENTS,
  createTelemetryEvent,
  createHandoffStarted,
  createHandoffCompleted,
  createHandoffFallback,
  createAuthorityReview,
  createErrorEvent,
  createTelemetryBundle
} = require('../../Data/marion/runtime/MarionLingoLinkTelemetry');

test('creates base telemetry event', () => {
  const event = createTelemetryEvent(EVENTS.HANDOFF_STARTED, {
    requestId: 'req_1',
    route: 'LINGOLINK_TRANSLATE',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    confidence: 0.9
  });

  assert.equal(event.event, EVENTS.HANDOFF_STARTED);
  assert.equal(event.gateway, 'marion-lingolink');
  assert.equal(event.marionFinalAuthority, true);
  assert.equal(event.requestId, 'req_1');
  assert.equal(event.route, 'LINGOLINK_TRANSLATE');
  assert.equal(event.sourceLanguage, 'en');
  assert.equal(event.targetLanguage, 'fr');
  assert.equal(event.confidence, 0.9);
  assert.ok(event.timestamp);
});

test('creates handoff started event', () => {
  const event = createHandoffStarted({
    requestId: 'req_2',
    route: 'LINGOLINK_TRANSLATE'
  });

  assert.equal(event.event, EVENTS.HANDOFF_STARTED);
  assert.equal(event.requestId, 'req_2');
});

test('creates handoff completed event', () => {
  const event = createHandoffCompleted({
    requestId: 'req_3',
    route: 'LINGOLINK_TRANSLATE',
    approvedByMarion: true,
    latencyMs: 20
  });

  assert.equal(event.event, EVENTS.HANDOFF_COMPLETED);
  assert.equal(event.approvedByMarion, true);
  assert.equal(event.latencyMs, 20);
});

test('creates fallback event with fallbackUsed true', () => {
  const event = createHandoffFallback({
    requestId: 'req_4',
    route: 'LINGOLINK_TRANSLATE'
  });

  assert.equal(event.event, EVENTS.HANDOFF_FALLBACK);
  assert.equal(event.fallbackUsed, true);
});

test('creates authority review event', () => {
  const event = createAuthorityReview({
    requestId: 'req_5',
    approvedByMarion: true,
    confidence: 0.88
  });

  assert.equal(event.event, EVENTS.AUTHORITY_REVIEW);
  assert.equal(event.approvedByMarion, true);
  assert.equal(event.confidence, 0.88);
});

test('creates error event', () => {
  const event = createErrorEvent({
    requestId: 'req_6',
    error: 'Something failed.'
  });

  assert.equal(event.event, EVENTS.ERROR);
  assert.equal(event.error, 'Something failed.');
});

test('creates telemetry bundle', () => {
  const events = [
    createHandoffStarted({ requestId: 'req_7' }),
    createHandoffCompleted({ requestId: 'req_7' })
  ];

  const bundle = createTelemetryBundle(events);

  assert.equal(bundle.ok, true);
  assert.equal(bundle.gateway, 'marion-lingolink');
  assert.equal(bundle.count, 2);
  assert.equal(bundle.events.length, 2);
});

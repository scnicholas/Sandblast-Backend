'use strict';

/**
 * MarionLingoLinkTelemetry
 *
 * Lightweight telemetry collector for Marion ↔ LingoLink handoffs.
 * This does not persist by default. It returns structured events that can be
 * logged, stored, or forwarded by Marion later.
 */

const EVENTS = Object.freeze({
  HANDOFF_STARTED: 'MARION_LINGOLINK_HANDOFF_STARTED',
  HANDOFF_COMPLETED: 'MARION_LINGOLINK_HANDOFF_COMPLETED',
  HANDOFF_FALLBACK: 'MARION_LINGOLINK_HANDOFF_FALLBACK',
  AUTHORITY_REVIEW: 'MARION_LINGOLINK_AUTHORITY_REVIEW',
  ERROR: 'MARION_LINGOLINK_ERROR'
});

function nowIso() {
  return new Date().toISOString();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createTelemetryEvent(event, payload = {}) {
  return {
    event,
    timestamp: nowIso(),
    gateway: 'marion-lingolink',
    marionFinalAuthority: true,
    requestId: payload.requestId || payload.marionRequestId || null,
    route: payload.route || null,
    sourceLanguage: payload.sourceLanguage || null,
    targetLanguage: payload.targetLanguage || null,
    confidence: safeNumber(payload.confidence, 0),
    fallbackUsed: Boolean(payload.fallbackUsed),
    approvedByMarion: payload.approvedByMarion === undefined
      ? null
      : Boolean(payload.approvedByMarion),
    latencyMs: payload.latencyMs === undefined
      ? null
      : safeNumber(payload.latencyMs, null),
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    error: payload.error || null,
    metadata: payload.metadata || {}
  };
}

function createHandoffStarted(payload = {}) {
  return createTelemetryEvent(EVENTS.HANDOFF_STARTED, payload);
}

function createHandoffCompleted(payload = {}) {
  return createTelemetryEvent(EVENTS.HANDOFF_COMPLETED, payload);
}

function createHandoffFallback(payload = {}) {
  return createTelemetryEvent(EVENTS.HANDOFF_FALLBACK, {
    ...payload,
    fallbackUsed: true
  });
}

function createAuthorityReview(payload = {}) {
  return createTelemetryEvent(EVENTS.AUTHORITY_REVIEW, payload);
}

function createErrorEvent(payload = {}) {
  return createTelemetryEvent(EVENTS.ERROR, payload);
}

function createTelemetryBundle(events = []) {
  const cleanEvents = Array.isArray(events)
    ? events.filter(Boolean)
    : [];

  return {
    ok: true,
    gateway: 'marion-lingolink',
    count: cleanEvents.length,
    events: cleanEvents
  };
}

module.exports = {
  EVENTS,
  createTelemetryEvent,
  createHandoffStarted,
  createHandoffCompleted,
  createHandoffFallback,
  createAuthorityReview,
  createErrorEvent,
  createTelemetryBundle
};

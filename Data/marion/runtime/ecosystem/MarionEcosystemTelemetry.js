'use strict';

const VERSION = 'marion.ecosystemTelemetry/1.1';
const configuredMax = Number(process.env.MARION_ECOSYSTEM_TELEMETRY_MAX);
const MAX_EVENTS = Number.isFinite(configuredMax) && configuredMax > 0 ? Math.max(50, Math.min(1000, Math.floor(configuredMax))) : 250;
const MAX_COUNTER_KEYS = 256;
const events = [];
const counters = Object.create(null);
function clean(value, max = 160) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function normalize(data = {}) {
  const input = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const duration = Number(input.durationMs);
  return {
    type: clean(input.type, 80), requestId: clean(input.requestId, 128), traceId: clean(input.traceId, 128),
    sessionId: clean(input.sessionId, 128), source: clean(input.source, 64), target: clean(input.target, 64),
    eventType: clean(input.eventType, 80), stage: clean(input.stage, 80), status: clean(input.status, 48),
    durationMs: Number.isFinite(duration) ? Math.max(0, Math.min(duration, 86400000)) : 0,
    timestamp: Date.now()
  };
}
function record(type, data = {}) {
  const key = clean(type || 'unknown', 80) || 'unknown';
  const counterKey = Object.hasOwn(counters, key) || Object.keys(counters).length < MAX_COUNTER_KEYS ? key : '_other';
  counters[counterKey] = Math.min(Number.MAX_SAFE_INTEGER, (counters[counterKey] || 0) + 1);
  events.push(normalize({ ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}), type: key }));
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return true;
}
function snapshot(options = {}) {
  return { ok: true, service: 'MarionEcosystemTelemetry', version: VERSION,
    eventCount: events.length, counters: { ...counters },
    ...(options && options.includeEvents === true ? { events: events.map(event => ({ ...event })) } : {}) };
}
function resetForTests() {
  events.length = 0;
  for (const key of Object.keys(counters)) delete counters[key];
}
module.exports = Object.freeze({ VERSION, record, snapshot, resetForTests });

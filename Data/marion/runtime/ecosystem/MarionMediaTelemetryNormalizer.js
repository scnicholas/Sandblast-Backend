
'use strict';

const Contract = require('./MarionMediaEventContract');

const VERSION = 'marion.mediaTelemetryNormalizer/4.0';

function clean(value, max = 160) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function hasSensitiveText(value) {
  const text = String(value == null ? '' : value);
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ||
    /(?:\+?\d[\s().-]*){8,}/.test(text);
}

function redact(value) {
  return hasSensitiveText(value) ? '' : clean(value, 160);
}

function normalize(input = {}) {
  const event = Contract.normalize(input);

  event.campaignId = redact(event.campaignId);
  event.contentId = redact(event.contentId);

  for (const [key, value] of Object.entries(event.metadata || {})) {
    event.metadata[key] = redact(value);
  }

  return event;
}

function validate(input = {}) {
  const event = normalize(input);
  const contract = Contract.validate(event);
  const errors = [...contract.errors];

  const inspect = JSON.stringify({
    campaignId:event.campaignId,
    contentId:event.contentId,
    metadata:event.metadata
  });

  if (hasSensitiveText(inspect)) errors.push('sensitive_data_detected');

  return { ok:errors.length===0, errors, event };
}

function toEcosystemEnvelope(event = {}) {
  const normalized = normalize(event);
  return {
    requestId: normalized.requestId,
    traceId: normalized.traceId,
    sessionId: normalized.sessionId,
    source: normalized.component,
    target: 'marion',
    eventType: 'media.event',
    intent: 'media.telemetry.aggregate',
    payload: { event: normalized },
    metadata: {
      ecosystemPhase: 4,
      eventName: normalized.eventName,
      campaignId: normalized.campaignId
    }
  };
}

module.exports = Object.freeze({
  VERSION, normalize, validate, toEcosystemEnvelope, hasSensitiveText
});

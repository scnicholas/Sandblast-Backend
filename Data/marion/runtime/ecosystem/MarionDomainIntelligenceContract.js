'use strict';

const crypto = require('crypto');

const VERSION = 'marion.domainIntelligenceContract/5.0';
const CONTRACT = 'sandblast.marion.domain-intelligence/5.0';

const DOMAINS = Object.freeze([
  'chronicle',
  'project-guardians'
]);

const INTENTS = Object.freeze({
  chronicle: [
    'historical_reconstruction',
    'evidence_query',
    'claim_validation',
    'provenance_explanation',
    'temporal_validation'
  ],
  'project-guardians': [
    'signal_analysis',
    'risk_review',
    'pattern_review',
    'strategy_review',
    'scenario_planning',
    'ethical_review',
    'decision_support'
  ]
});

function clean(value, max = 4000) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function id(value, prefix) {
  const normalized = clean(value, 128).replace(/[^a-zA-Z0-9._:-]/g, '-');
  if (normalized) return normalized;

  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDomain(value) {
  const s = clean(value, 64).toLowerCase().replace(/[_\s]+/g, '-');

  if (s === 'guardians' || s === 'projectguardians' || s === 'project-guardian') {
    return 'project-guardians';
  }

  if (s === 'chronicle') return 'chronicle';

  return s;
}

function normalizeIntent(domain, value) {
  const d = normalizeDomain(domain);
  const s = clean(value, 100).toLowerCase().replace(/[\s-]+/g, '_');
  const allowed = INTENTS[d] || [];

  if (allowed.includes(s)) return s;

  return d === 'chronicle'
    ? 'evidence_query'
    : 'signal_analysis';
}

function normalize(input = {}) {
  const payload = obj(input.payload);

  const domain = normalizeDomain(
    input.domain ||
    input.target ||
    payload.domain ||
    payload.target
  );

  return {
    contract: CONTRACT,
    version: VERSION,

    requestId: id(input.requestId || payload.requestId, 'domain'),
    traceId: id(input.traceId || payload.traceId, 'trace'),

    sessionId: clean(input.sessionId || payload.sessionId, 128),
    conversationId: clean(input.conversationId || payload.conversationId, 128),

    source: clean(input.source || payload.source || 'marion', 64).toLowerCase(),
    domain,

    intent: normalizeIntent(
      domain,
      input.intent || payload.intent
    ),

    query: clean(
      input.query ||
      input.text ||
      input.message ||
      payload.query ||
      payload.text ||
      payload.message,
      4000
    ),

    context: obj(input.context || payload.context),

    evidence: arr(input.evidence || payload.evidence)
      .slice(0, 50),

    metadata: obj(input.metadata || payload.metadata),

    timestamp: Number.isFinite(+input.timestamp)
      ? +input.timestamp
      : Date.now()
  };
}

function validate(value = {}) {
  const errors = [];

  if (!value || typeof value !== 'object') {
    return { ok: false, errors: ['request_required'] };
  }

  if (value.contract !== CONTRACT) errors.push('contract_invalid');
  if (!clean(value.requestId, 128)) errors.push('requestId_required');
  if (!clean(value.traceId, 128)) errors.push('traceId_required');
  if (value.source !== 'marion') errors.push('source_must_be_marion');
  if (!DOMAINS.includes(value.domain)) errors.push('domain_invalid');
  if (!clean(value.query, 4000)) errors.push('query_required');

  const allowed = INTENTS[value.domain] || [];
  if (!allowed.includes(value.intent)) errors.push('intent_invalid');

  return {
    ok: errors.length === 0,
    errors
  };
}

function response(request = {}, output = {}) {
  const req = normalize(request);
  const out = obj(output);

  return {
    ok: out.ok !== false,
    contract: CONTRACT,
    version: VERSION,

    requestId: req.requestId,
    traceId: req.traceId,
    sessionId: req.sessionId,
    conversationId: req.conversationId,

    source: req.domain,
    target: 'marion',

    domain: req.domain,
    intent: req.intent,

    answer: clean(out.answer || out.text || out.summary, 6000),
    payload: obj(out.payload),
    warnings: arr(out.warnings).map(v => clean(v, 240)).filter(Boolean).slice(0, 20),

    advisoryOnly: out.advisoryOnly !== false,
    humanReviewRequired: out.humanReviewRequired === true,

    metadata: {
      ...obj(out.metadata),
      correlated: true
    },

    timestamp: Date.now()
  };
}

module.exports = Object.freeze({
  VERSION,
  CONTRACT,
  DOMAINS,
  INTENTS,
  normalize,
  validate,
  response,
  normalizeDomain,
  normalizeIntent
});

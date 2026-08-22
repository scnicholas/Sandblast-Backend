'use strict';

const crypto = require('crypto');

const CONTRACT = 'marion.lingosentinel/1.0';
const MAX_TEXT = 4000;
const EVENT_TYPES = Object.freeze([
  'handshake.request','handshake.ack','health.request','health.response',
  'conversation.message','conversation.response','command','command.ack','error'
]);

function text(v, max = 160) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function id(v, prefix) {
  const s = text(v, 128).replace(/[^a-zA-Z0-9._:-]/g, '-');
  return s || `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}
function lang(v, fallback = 'en') {
  const s = text(v || fallback, 32).toLowerCase().replace(/_/g, '-');
  if (/^(en|eng|english|en-ca|en-us|en-gb)/.test(s)) return 'en';
  if (/^(fr|fre|fra|french|français|francais|fr-ca|fr-fr)/.test(s)) return 'fr';
  if (/^(es|spa|spanish|español|espanol|es-mx|es-es|es-419)/.test(s)) return 'es';
  return s.slice(0, 16) || fallback;
}
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function event(v, fallback = 'conversation.message') {
  const e = text(v || fallback, 64);
  return EVENT_TYPES.includes(e) ? e : fallback;
}

function createEnvelope(input = {}) {
  const p = obj(input.payload);
  const sourceLanguage = lang(input.sourceLanguage || p.sourceLanguage || 'en');
  const targetLanguage = lang(input.targetLanguage || p.targetLanguage || sourceLanguage);
  return {
    contract: CONTRACT,
    requestId: id(input.requestId, 'req'),
    sessionId: id(input.sessionId, 'session'),
    conversationId: text(input.conversationId, 128),
    roomId: text(input.roomId || 'lingosentinel-main', 128),
    source: text(input.source || 'lingosentinel', 32),
    target: text(input.target || 'marion', 32),
    eventType: event(input.eventType),
    intent: text(input.intent || p.intent || 'conversation', 80),
    sourceLanguage,
    targetLanguage,
    cultureContext: text(input.cultureContext || p.cultureContext || 'general', 80),
    layer: text(input.layer || p.layer || 'language', 40),
    mode: text(input.mode || p.mode || 'one_to_one', 40),
    participantId: text(input.participantId || p.participantId || 'host', 128),
    speakerRole: text(input.speakerRole || p.speakerRole || 'host', 32),
    message: text(input.message || input.text || p.message || p.text, MAX_TEXT),
    translatedMessage: text(input.translatedMessage || p.translatedMessage, MAX_TEXT),
    timestamp: Number.isFinite(+input.timestamp) ? +input.timestamp : Date.now(),
    version: '1.0.0',
    metadata: obj(input.metadata)
  };
}

function createResponse(request, output = {}) {
  const req = createEnvelope(request);
  const out = obj(output);
  return createEnvelope({
    requestId: req.requestId,
    sessionId: req.sessionId,
    conversationId: req.conversationId,
    roomId: req.roomId,
    source: 'marion', target: 'lingosentinel',
    eventType: out.eventType || 'conversation.response',
    intent: req.intent,
    sourceLanguage: out.sourceLanguage || req.sourceLanguage,
    targetLanguage: out.targetLanguage || req.targetLanguage,
    cultureContext: out.cultureContext || req.cultureContext,
    layer: out.layer || req.layer,
    mode: out.mode || req.mode,
    participantId: out.participantId || 'marion',
    speakerRole: out.speakerRole || 'intelligence',
    message: out.message || out.text || '',
    translatedMessage: out.translatedMessage || '',
    metadata: { ...req.metadata, ...obj(out.metadata), correlated: true }
  });
}

function validateEnvelope(value = {}) {
  const errors = [];
  if (!value || typeof value !== 'object') return { ok: false, errors: ['envelope_required'] };
  if (value.contract !== CONTRACT) errors.push('contract_invalid');
  if (!text(value.requestId, 128)) errors.push('requestId_required');
  if (!text(value.sessionId, 128)) errors.push('sessionId_required');
  if (!EVENT_TYPES.includes(value.eventType)) errors.push('eventType_invalid');
  if (!text(value.sourceLanguage, 16)) errors.push('sourceLanguage_required');
  if (!text(value.targetLanguage, 16)) errors.push('targetLanguage_required');
  return { ok: !errors.length, errors };
}

function languagePair(input = {}) {
  const e = createEnvelope(input);
  return { source: e.sourceLanguage, target: e.targetLanguage, sameLanguage: e.sourceLanguage === e.targetLanguage };
}

module.exports = Object.freeze({ CONTRACT, EVENT_TYPES, MAX_TEXT, createEnvelope, createResponse, validateEnvelope, languagePair, normalizeLanguage: lang });

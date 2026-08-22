'use strict';

const crypto = require('crypto');
const COGNITIVE_CONTRACT = 'marion.lingosentinel.cognitive/3.0';
const CANONICAL_LANGUAGE = 'en';
const VALID_MODES = Object.freeze(['one_to_one','group_room','live_translate','delivered']);
const VALID_LAYERS = Object.freeze(['language','culture']);
const VALID_SPEAKERS = Object.freeze(['host','remote','intelligence']);
const VALID_RETURN_MODES = Object.freeze(['both','canonical','localized']);
const MAX_TEXT = 4000;
const MAX_HISTORY = 12;

function text(v, max = 160) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function arr(v) { return Array.isArray(v) ? v : []; }
function id(v, prefix) {
  const s = text(v,128).replace(/[^a-zA-Z0-9._:-]/g,'-');
  return s || `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}
function oneOf(v, allowed, fallback) { const s = text(v,48); return allowed.includes(s) ? s : fallback; }
function language(v, fallback = 'en') {
  const s = text(v || fallback,32).toLowerCase().replace(/_/g,'-');
  if (/^(en|eng|english|en-ca|en-us|en-gb)/.test(s)) return 'en';
  if (/^(fr|fre|fra|french|français|francais|fr-ca|fr-fr)/.test(s)) return 'fr';
  if (/^(es|spa|spanish|español|espanol|es-mx|es-es|es-419)/.test(s)) return 'es';
  return s.slice(0,16) || fallback;
}
function historyItem(v = {}) {
  const x = obj(v);
  return {
    role: oneOf(x.role || x.speakerRole, VALID_SPEAKERS, 'host'),
    language: language(x.language || x.sourceLanguage || 'en'),
    text: text(x.text || x.message, MAX_TEXT),
    canonicalText: text(x.canonicalText, MAX_TEXT),
    timestamp: Number.isFinite(+x.timestamp) ? +x.timestamp : Date.now()
  };
}
function normalizeRequest(input = {}) {
  const p = obj(input.payload);
  const sourceLanguage = language(input.sourceLanguage || p.sourceLanguage || 'en');
  const targetLanguage = language(input.targetLanguage || p.targetLanguage || sourceLanguage);
  return {
    contract: COGNITIVE_CONTRACT,
    requestId: id(input.requestId || p.requestId,'cog'),
    sessionId: text(input.sessionId || p.sessionId,128),
    conversationId: text(input.conversationId || p.conversationId,128),
    roomId: text(input.roomId || p.roomId || 'lingosentinel-main',128),
    sourceLanguage,
    targetLanguage,
    canonicalLanguage: CANONICAL_LANGUAGE,
    cultureContext: text(input.cultureContext || p.cultureContext || 'general',80),
    layer: oneOf(input.layer || p.layer, VALID_LAYERS, 'language'),
    mode: oneOf(input.mode || p.mode, VALID_MODES, 'one_to_one'),
    speakerRole: oneOf(input.speakerRole || p.speakerRole, VALID_SPEAKERS, 'host'),
    participantId: text(input.participantId || p.participantId || 'host',128),
    intent: text(input.intent || p.intent || 'conversation',80),
    message: text(input.message || input.text || p.message || p.text,MAX_TEXT),
    returnMode: oneOf(input.returnMode || p.returnMode, VALID_RETURN_MODES, 'both'),
    history: arr(input.history || p.history).slice(-MAX_HISTORY).map(historyItem).filter(x=>x.text),
    timestamp: Number.isFinite(+input.timestamp) ? +input.timestamp : Date.now(),
    metadata: obj(input.metadata || p.metadata)
  };
}
function validateRequest(v = {}) {
  const errors = [];
  if (!v || typeof v !== 'object') return { ok:false, errors:['request_required'] };
  if (v.contract !== COGNITIVE_CONTRACT) errors.push('contract_invalid');
  if (!text(v.requestId,128)) errors.push('requestId_required');
  if (!text(v.sessionId,128)) errors.push('sessionId_required');
  if (!text(v.message,MAX_TEXT)) errors.push('message_required');
  if (!VALID_LAYERS.includes(v.layer)) errors.push('layer_invalid');
  if (!VALID_MODES.includes(v.mode)) errors.push('mode_invalid');
  if (!VALID_SPEAKERS.includes(v.speakerRole)) errors.push('speakerRole_invalid');
  if (!VALID_RETURN_MODES.includes(v.returnMode)) errors.push('returnMode_invalid');
  return { ok:!errors.length, errors };
}
function createResponse(request, result = {}) {
  const r = normalizeRequest(request), x = obj(result);
  return {
    contract: COGNITIVE_CONTRACT,
    requestId: r.requestId,
    sessionId: r.sessionId,
    conversationId: r.conversationId,
    roomId: r.roomId,
    sourceLanguage: r.sourceLanguage,
    targetLanguage: r.targetLanguage,
    canonicalLanguage: CANONICAL_LANGUAGE,
    cultureContext: r.cultureContext,
    layer: r.layer,
    mode: r.mode,
    speakerRole: 'intelligence',
    canonicalInput: text(x.canonicalInput,MAX_TEXT),
    canonicalResponse: text(x.canonicalResponse,MAX_TEXT),
    localizedResponse: text(x.localizedResponse,MAX_TEXT),
    displayText: text(x.displayText || x.localizedResponse || x.canonicalResponse,MAX_TEXT),
    inputTranslation: obj(x.inputTranslation),
    outputTranslation: obj(x.outputTranslation),
    cognitiveContext: obj(x.cognitiveContext),
    marion: obj(x.marion),
    degraded: x.degraded === true,
    warnings: arr(x.warnings).map(v=>text(v,180)).filter(Boolean).slice(0,12),
    timestamp: Date.now(),
    version: '3.0.0'
  };
}

module.exports = Object.freeze({
  COGNITIVE_CONTRACT, CANONICAL_LANGUAGE, VALID_MODES, VALID_LAYERS,
  VALID_SPEAKERS, VALID_RETURN_MODES, MAX_TEXT, MAX_HISTORY,
  normalizeRequest, validateRequest, createResponse, normalizeLanguage:language
});

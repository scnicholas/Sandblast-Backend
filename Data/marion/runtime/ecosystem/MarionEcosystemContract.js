'use strict';

const crypto = require('crypto');

const CONTRACT = 'sandblast.marion.ecosystem/1.0';
const VERSION = '1.0.0';
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_TEXT = 4000;

const EVENT_TYPES = Object.freeze([
  'component.register',
  'component.ready',
  'component.health',
  'component.state',
  'component.command',
  'component.command.ack',
  'conversation.message',
  'conversation.response',
  'lead.created',
  'lead.updated',
  'media.event',
  'telemetry.event',
  'domain.request',
  'domain.response',
  'error'
]);

const COMPONENTS = Object.freeze([
  'nyx',
  'lingosentinel',
  'crm',
  'sandblast-channel',
  'sandblast-radio',
  'sandblast-tv',
  'synapse',
  'chronicle',
  'project-guardians',
  'marion'
]);

function cleanText(value, max = 160) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function makeId(value, prefix) {
  const normalized = cleanText(value, 128).replace(/[^a-zA-Z0-9._:-]/g, '-');
  if (normalized) return normalized;
  if (typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeComponent(value, fallback = '') {
  return cleanText(value || fallback, 64).toLowerCase().replace(/[_\s]+/g, '-');
}

function normalizeEventType(value, fallback = 'telemetry.event') {
  const eventType = cleanText(value || fallback, 80);
  return EVENT_TYPES.includes(eventType) ? eventType : fallback;
}

function normalizeEnvelope(input = {}) {
  const payload = safeObject(input.payload);
  return {
    contract: CONTRACT,
    version: VERSION,
    requestId: makeId(input.requestId || payload.requestId, 'eco'),
    traceId: makeId(input.traceId || payload.traceId, 'trace'),
    sessionId: cleanText(input.sessionId || payload.sessionId, 128),
    conversationId: cleanText(input.conversationId || payload.conversationId, 128),
    roomId: cleanText(input.roomId || payload.roomId, 128),
    source: normalizeComponent(input.source || payload.source || 'unknown'),
    target: normalizeComponent(input.target || payload.target || 'marion'),
    eventType: normalizeEventType(input.eventType || payload.eventType),
    intent: cleanText(input.intent || payload.intent || 'observe', 100),
    text: cleanText(input.text || input.message || payload.text || payload.message, MAX_TEXT),
    state: safeObject(input.state || payload.state),
    payload: safeObject(input.payload),
    permissions: safeArray(input.permissions || payload.permissions)
      .map(value => cleanText(value, 80)).filter(Boolean).slice(0, 32),
    metadata: safeObject(input.metadata || payload.metadata),
    timestamp: Number.isFinite(+input.timestamp) ? +input.timestamp : Date.now()
  };
}

function validateEnvelope(value = {}) {
  const errors = [];
  if (!value || typeof value !== 'object') return { ok: false, errors: ['envelope_required'] };
  if (value.contract !== CONTRACT) errors.push('contract_invalid');
  if (!cleanText(value.requestId, 128)) errors.push('requestId_required');
  if (!cleanText(value.traceId, 128)) errors.push('traceId_required');
  if (!cleanText(value.source, 64)) errors.push('source_required');
  if (!cleanText(value.target, 64)) errors.push('target_required');
  if (!EVENT_TYPES.includes(value.eventType)) errors.push('eventType_invalid');
  const bytes = Buffer.byteLength(JSON.stringify(value.payload || {}), 'utf8');
  if (bytes > MAX_PAYLOAD_BYTES) errors.push('payload_too_large');
  return { ok: errors.length === 0, errors };
}

function createResponse(request = {}, output = {}) {
  const req = normalizeEnvelope(request);
  const out = safeObject(output);
  return normalizeEnvelope({
    requestId: req.requestId,
    traceId: req.traceId,
    sessionId: req.sessionId,
    conversationId: req.conversationId,
    roomId: req.roomId,
    source: out.source || req.target || 'marion',
    target: out.target || req.source,
    eventType: out.eventType || (req.eventType === 'component.command' ? 'component.command.ack' : 'domain.response'),
    intent: out.intent || req.intent,
    text: out.text || out.message || '',
    state: out.state,
    payload: out.payload,
    permissions: out.permissions,
    metadata: { ...req.metadata, ...safeObject(out.metadata), correlated: true }
  });
}

module.exports = Object.freeze({
  CONTRACT,
  VERSION,
  MAX_PAYLOAD_BYTES,
  MAX_TEXT,
  EVENT_TYPES,
  COMPONENTS,
  normalizeEnvelope,
  validateEnvelope,
  createResponse,
  normalizeComponent,
  normalizeEventType
});

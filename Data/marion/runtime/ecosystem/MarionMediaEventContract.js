
'use strict';

const crypto = require('crypto');

const CONTRACT = 'sandblast.marion.media-event/4.0';
const VERSION = 'marion.mediaEventContract/4.0';
const MAX_METADATA_BYTES = 4096;
const MAX_BATCH = 50;

const COMPONENTS = Object.freeze([
  'sandblast-channel',
  'sandblast-radio',
  'sandblast-tv',
  'synapse'
]);

const EVENTS = Object.freeze({
  'sandblast-channel': Object.freeze([
    'page.view',
    'page.cta_click',
    'advertising.inquiry',
    'roku.outbound_click',
    'apple.outbound_click'
  ]),
  'sandblast-radio': Object.freeze([
    'radio.play',
    'radio.stop',
    'radio.session'
  ]),
  'sandblast-tv': Object.freeze([
    'tv.content_open',
    'tv.content_complete',
    'tv.watch_duration'
  ]),
  synapse: Object.freeze([
    'synapse.story_open',
    'synapse.category_open'
  ])
});

function clean(value, max = 180) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function id(value, prefix) {
  const normalized = clean(value, 128).replace(/[^a-zA-Z0-9._:-]/g, '-');
  if (normalized) return normalized;
  if (typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}

function component(value) {
  return clean(value, 64).toLowerCase().replace(/[_\s]+/g, '-');
}

function eventName(value) {
  return clean(value, 80).toLowerCase();
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safePath(value) {
  const raw = clean(value, 300);
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://sandblast.invalid');
    return clean(url.pathname, 220);
  } catch (_) {
    return clean(raw.split('?')[0].split('#')[0], 220);
  }
}

function safeHost(value) {
  const raw = clean(value, 300);
  if (!raw) return '';
  try { return clean(new URL(raw).hostname, 120).toLowerCase(); }
  catch (_) { return clean(raw, 120).toLowerCase().replace(/[^a-z0-9.-]/g,''); }
}

function sanitizeMetadata(value = {}) {
  const source = object(value);
  const allowed = [
    'placement', 'surface', 'category', 'format', 'player', 'deviceClass',
    'contentType', 'campaignSource', 'campaignMedium', 'campaignName',
    'countryCode', 'language', 'action'
  ];
  const output = {};
  for (const key of allowed) {
    if (source[key] !== undefined && source[key] !== null) {
      output[key] = clean(source[key], 120);
    }
  }
  return output;
}

function normalize(input = {}) {
  const p = object(input.payload);
  const c = component(input.component || input.source || p.component || p.source);
  const name = eventName(input.eventName || input.name || p.eventName || p.name);
  const metadata = sanitizeMetadata(input.metadata || p.metadata);

  return {
    contract: CONTRACT,
    version: VERSION,
    eventId: id(input.eventId || p.eventId, 'media'),
    requestId: id(input.requestId || p.requestId, 'req'),
    traceId: id(input.traceId || p.traceId, 'trace'),
    sessionId: id(input.sessionId || p.sessionId, 'session'),
    component: c,
    eventName: name,
    campaignId: clean(input.campaignId || p.campaignId, 120),
    contentId: clean(input.contentId || p.contentId, 160),
    pagePath: safePath(input.pagePath || p.pagePath),
    referrerHost: safeHost(input.referrerHost || p.referrerHost),
    value: Math.max(0, number(input.value ?? p.value, 0)),
    durationMs: Math.max(0, Math.min(24 * 60 * 60 * 1000, number(input.durationMs ?? p.durationMs, 0))),
    metadata,
    timestamp: Number.isFinite(+input.timestamp) ? +input.timestamp : Date.now(),
    privacy: {
      containsEmail: false,
      containsPhone: false,
      containsRawUserId: false,
      queryStringStored: false,
      referrerPathStored: false
    }
  };
}

function validate(value = {}) {
  const errors = [];
  if (!value || typeof value !== 'object') return { ok:false, errors:['event_required'] };
  if (value.contract !== CONTRACT) errors.push('contract_invalid');
  if (!COMPONENTS.includes(value.component)) errors.push('component_invalid');
  if (!EVENTS[value.component] || !EVENTS[value.component].includes(value.eventName)) errors.push('event_name_invalid');
  if (!clean(value.eventId, 128)) errors.push('eventId_required');
  if (!clean(value.sessionId, 128)) errors.push('sessionId_required');
  if (Buffer.byteLength(JSON.stringify(value.metadata || {}), 'utf8') > MAX_METADATA_BYTES) errors.push('metadata_too_large');
  return { ok:errors.length===0, errors };
}

function isAllowed(componentName, name) {
  const c = component(componentName), e = eventName(name);
  return COMPONENTS.includes(c) && EVENTS[c] && EVENTS[c].includes(e);
}

module.exports = Object.freeze({
  CONTRACT, VERSION, MAX_METADATA_BYTES, MAX_BATCH, COMPONENTS, EVENTS,
  normalize, validate, isAllowed, sanitizeMetadata, safePath, safeHost
});

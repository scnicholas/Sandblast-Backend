'use strict';

const crypto = require('crypto');

const VERSION = 'marion.domainRequestLedger/5.0';
const TTL_MS = Math.max(
  60000,
  Number(process.env.MARION_DOMAIN_LEDGER_TTL_MS || 10 * 60 * 1000) || 10 * 60 * 1000
);
const MAX = Math.max(
  100,
  Math.min(5000, Number(process.env.MARION_DOMAIN_LEDGER_MAX || 1500) || 1500)
);

const records = new Map();

function clean(value, max = 4000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function fingerprint(input = {}) {
  return crypto
    .createHash('sha256')
    .update([
      clean(input.source, 64),
      clean(input.domain, 64),
      clean(input.intent, 100),
      clean(input.sessionId, 128),
      clean(input.query, 4000)
    ].join('\u001f'))
    .digest('hex');
}

function prune(now = Date.now()) {
  for (const [key, value] of records) {
    if (!value || now - value.updatedAt > TTL_MS) {
      records.delete(key);
    }
  }

  if (records.size > MAX) {
    const ordered = [...records.entries()]
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt);

    for (let i = 0; i < ordered.length - MAX; i += 1) {
      records.delete(ordered[i][0]);
    }
  }
}

function claim(input = {}) {
  prune();

  const id = clean(input.requestId, 128);
  if (!id) return { ok: false, status: 'invalid', error: 'requestId_required' };

  const fp = fingerprint(input);
  const existing = records.get(id);
  const now = Date.now();

  if (existing) {
    if (existing.fingerprint !== fp) {
      return {
        ok: false,
        status: 'conflict',
        error: 'requestId_payload_conflict'
      };
    }

    if (existing.status === 'completed') {
      return {
        ok: true,
        status: 'duplicate_completed',
        response: clone(existing.response)
      };
    }

    return {
      ok: false,
      status: 'duplicate_inflight',
      error: 'request_inflight'
    };
  }

  records.set(id, {
    requestId: id,
    fingerprint: fp,
    status: 'processing',
    createdAt: now,
    updatedAt: now
  });

  return {
    ok: true,
    status: 'claimed'
  };
}

function complete(requestId, response) {
  const record = records.get(clean(requestId, 128));
  if (!record) return false;

  record.status = 'completed';
  record.response = clone(response);
  record.updatedAt = Date.now();

  return true;
}

function fail(requestId, error) {
  const record = records.get(clean(requestId, 128));
  if (!record) return false;

  records.delete(clean(requestId, 128));
  return Boolean(error || true);
}

function getHealth() {
  prune();

  return {
    ok: true,
    service: 'MarionDomainRequestLedger',
    version: VERSION,
    records: records.size,
    ttlMs: TTL_MS,
    maxRecords: MAX
  };
}

function resetForTests() {
  records.clear();
}

module.exports = Object.freeze({
  VERSION,
  claim,
  complete,
  fail,
  fingerprint,
  getHealth,
  resetForTests
});

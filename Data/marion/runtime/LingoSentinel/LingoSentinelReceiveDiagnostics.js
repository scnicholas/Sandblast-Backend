'use strict';

const VERSION = 'nyx.lingosentinel.receiveDiagnostics/7.0-redacted-aggregate';
const ALLOWED_CODES = new Set([
  'message_published', 'message_validation_failed', 'public_projection_failed',
  'provider_publish_failed', 'wrong_room_rejected', 'duplicate_rejected',
  'unknown_contract_rejected', 'private_field_rejected'
]);
const counters = new Map();
let lastUpdatedAt = null;

function record(code) {
  const key = ALLOWED_CODES.has(String(code || '')) ? String(code) : 'message_validation_failed';
  counters.set(key, (counters.get(key) || 0) + 1);
  lastUpdatedAt = new Date().toISOString();
  return true;
}

function snapshot() {
  return {
    ok: true,
    service: 'LingoSentinelReceiveDiagnostics',
    version: VERSION,
    counters: Object.fromEntries(Array.from(ALLOWED_CODES).map((key) => [key, counters.get(key) || 0])),
    lastUpdatedAt,
    messageContentStored: false,
    identityStored: false,
    credentialsStored: false
  };
}

function reset() { counters.clear(); lastUpdatedAt = null; }

module.exports = Object.freeze({ VERSION, record, snapshot, reset });

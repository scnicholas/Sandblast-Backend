
'use strict';

const VERSION = 'marion.mediaEventLedger/4.0';
const TTL_MS = Math.max(60_000, Number(process.env.MEDIA_PHASE4_LEDGER_TTL_MS || 10 * 60_000) || 10 * 60_000);
const MAX_RECORDS = Math.max(500, Math.min(50_000, Number(process.env.MEDIA_PHASE4_LEDGER_MAX || 10_000) || 10_000));
const records = new Map();

function clean(value, max = 128) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function prune(now = Date.now()) {
  for (const [key, value] of records) {
    if (!value || now - value.timestamp > TTL_MS) records.delete(key);
  }
  if (records.size > MAX_RECORDS) {
    const ordered = [...records.entries()].sort((a,b)=>a[1].timestamp-b[1].timestamp);
    for (let i=0; i<ordered.length-MAX_RECORDS; i++) records.delete(ordered[i][0]);
  }
}

function claim(event = {}) {
  prune();
  const id = clean(event.eventId);
  if (!id) return { ok:false, duplicate:false, error:'eventId_required' };
  const current = records.get(id);
  if (current) return { ok:true, duplicate:true, firstSeenAt:current.timestamp };
  records.set(id, { timestamp:Date.now(), component:event.component, eventName:event.eventName });
  return { ok:true, duplicate:false };
}

function getHealth() {
  prune();
  return { ok:true, service:'MarionMediaEventLedger', version:VERSION, records:records.size, ttlMs:TTL_MS, maxRecords:MAX_RECORDS };
}

function resetForTests() { records.clear(); }

module.exports = Object.freeze({ VERSION, TTL_MS, MAX_RECORDS, claim, getHealth, resetForTests });

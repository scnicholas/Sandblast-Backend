
'use strict';

const VERSION = 'marion.mediaRateLimiter/4.0';
const buckets = new Map();

function clean(value, max = 160) { return String(value == null ? '' : value).trim().slice(0,max); }
function limit() { return Math.max(10, Math.min(1000, Number(process.env.MEDIA_PHASE4_RATE_LIMIT_PER_MINUTE || 120) || 120)); }

function consume(event = {}, now = Date.now()) {
  const key = `${clean(event.component,64)}:${clean(event.sessionId,128)}`;
  if (!event.component || !event.sessionId) return { ok:false, error:'rate_key_invalid', retryAfterMs:60_000 };
  const minute = Math.floor(now / 60_000);
  const current = buckets.get(key);
  const bucket = !current || current.minute !== minute ? { minute, count:0 } : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  const max = limit();
  if (bucket.count > max) {
    return { ok:false, error:'rate_limited', limit:max, count:bucket.count, retryAfterMs:Math.max(1,(minute+1)*60_000-now) };
  }
  return { ok:true, limit:max, count:bucket.count };
}

function getHealth() { return { ok:true, service:'MarionMediaRateLimiter', version:VERSION, buckets:buckets.size, limitPerMinute:limit() }; }
function resetForTests() { buckets.clear(); }

module.exports = Object.freeze({ VERSION, consume, getHealth, resetForTests });

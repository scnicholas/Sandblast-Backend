'use strict';

const VERSION = 'nyx.lingosentinel.reconnectPolicy/4.0-bounded-backoff';
const DEFAULTS = Object.freeze({ initialDelayMs: 1000, maxDelayMs: 30000, maxAttempts: 8, jitterRatio: 0.2 });
const NON_RETRYABLE_CODES = Object.freeze(['40100', '40140', '40300', 'token_rejected', 'room_membership_required', 'capability_rejected']);

function clamp(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function normalize(options = {}) {
  return {
    initialDelayMs: clamp(options.initialDelayMs, DEFAULTS.initialDelayMs, 250, 10000),
    maxDelayMs: clamp(options.maxDelayMs, DEFAULTS.maxDelayMs, 1000, 120000),
    maxAttempts: Math.floor(clamp(options.maxAttempts, DEFAULTS.maxAttempts, 1, 20)),
    jitterRatio: clamp(options.jitterRatio, DEFAULTS.jitterRatio, 0, 0.5)
  };
}
function isRetryable(error = {}) {
  const code = String(error.code || error.statusCode || error.error || '').toLowerCase();
  if (NON_RETRYABLE_CODES.some((item) => code.includes(item))) return false;
  const status = Number(error.statusCode || error.status);
  if (status === 401 || status === 403) return false;
  return true;
}
function nextDelay(attempt, options = {}, random = Math.random) {
  const cfg = normalize(options);
  const index = Math.max(0, Math.floor(Number(attempt) || 0));
  const base = Math.min(cfg.maxDelayMs, cfg.initialDelayMs * Math.pow(2, index));
  const jitter = base * cfg.jitterRatio * ((typeof random === 'function' ? random() : 0.5) * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}
function decision(attempt, error = {}, options = {}) {
  const cfg = normalize(options);
  const count = Math.max(0, Math.floor(Number(attempt) || 0));
  if (!isRetryable(error)) return { retry: false, reason: 'non_retryable_authorization_failure', attempt: count, delayMs: 0, maxAttempts: cfg.maxAttempts };
  if (count >= cfg.maxAttempts) return { retry: false, reason: 'retry_limit_reached', attempt: count, delayMs: 0, maxAttempts: cfg.maxAttempts };
  return { retry: true, reason: 'temporary_failure', attempt: count, delayMs: nextDelay(count, cfg), maxAttempts: cfg.maxAttempts };
}
function getHealth() { return { ok: true, service: 'LingoSentinelReconnectPolicy', version: VERSION, defaults: DEFAULTS, authorizationFailuresRetryIndefinitely: false, boundedAttempts: true, jitterEnabled: true }; }
module.exports = Object.freeze({ VERSION, DEFAULTS, NON_RETRYABLE_CODES, normalize, isRetryable, nextDelay, decision, getHealth });

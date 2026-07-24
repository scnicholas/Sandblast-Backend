'use strict';

/**
 * LingoSentinelMembershipCredential
 * ------------------------------------------------------------
 * Opaque, room-scoped membership proof for Layers 5-7.
 * Only a SHA-256 hash is retained by the membership store.
 */

const crypto = require('crypto');

const VERSION = 'nyx.lingosentinel.membershipCredential/5.0-room-session-proof';
const HEADER_NAME = 'x-lingosentinel-membership';
const DEFAULT_TTL_MS = clamp(
  process.env.LINGOSENTINEL_MEMBERSHIP_CREDENTIAL_TTL_MS,
  60 * 60 * 1000,
  5 * 60 * 1000,
  24 * 60 * 60 * 1000
);

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

function safeString(value) {
  return String(value == null ? '' : value).trim();
}

function createCredential() {
  return `lsmc_${crypto.randomBytes(32).toString('base64url')}`;
}

function hashCredential(value) {
  const credential = safeString(value);
  if (!credential) return '';
  return crypto.createHash('sha256').update(credential, 'utf8').digest('hex');
}

function issueCredential(options = {}) {
  const ttlMs = clamp(options.ttlMs, DEFAULT_TTL_MS, 5 * 60 * 1000, 24 * 60 * 60 * 1000);
  const credential = createCredential();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const credentialHash = hashCredential(credential);
  return {
    credential,
    credentialHash,
    credentialId: credentialHash.slice(0, 16),
    issuedAt,
    expiresAt,
    ttlMs
  };
}

function timingSafeHashMatch(expectedHash, credential) {
  const expected = safeString(expectedHash);
  const actual = hashCredential(credential);
  if (!expected || !actual || expected.length !== actual.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
  } catch (_) {
    return false;
  }
}

function verifyCredential(record = {}, credential, now = Date.now()) {
  if (!record || record.active !== true) {
    return { ok: false, code: 'MEMBERSHIP_INACTIVE', error: 'membership_inactive' };
  }
  const expiresAt = Date.parse(record.credentialExpiresAt || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { ok: false, code: 'MEMBERSHIP_CREDENTIAL_EXPIRED', error: 'membership_credential_expired' };
  }
  if (!timingSafeHashMatch(record.credentialHash, credential)) {
    return { ok: false, code: 'MEMBERSHIP_CREDENTIAL_INVALID', error: 'membership_credential_invalid' };
  }
  return {
    ok: true,
    code: 'MEMBERSHIP_CREDENTIAL_VALID',
    credentialId: safeString(record.credentialId),
    expiresAt: record.credentialExpiresAt
  };
}

function readCredential(req = {}) {
  const headers = req.headers && typeof req.headers === 'object' ? req.headers : {};
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return safeString(
    headers[HEADER_NAME] ||
    headers[HEADER_NAME.toLowerCase()] ||
    (typeof req.get === 'function' ? req.get(HEADER_NAME) : '') ||
    body.membershipCredential ||
    body.membershipToken ||
    ''
  );
}

function getHealth() {
  return {
    ok: true,
    service: 'LingoSentinelMembershipCredential',
    version: VERSION,
    headerName: HEADER_NAME,
    storage: 'sha256_hash_only',
    roomScoped: true,
    sessionScoped: true,
    plaintextRetainedServerSide: false,
    defaultTtlMs: DEFAULT_TTL_MS
  };
}

module.exports = Object.freeze({
  VERSION,
  HEADER_NAME,
  DEFAULT_TTL_MS,
  createCredential,
  hashCredential,
  issueCredential,
  timingSafeHashMatch,
  verifyCredential,
  readCredential,
  getHealth
});

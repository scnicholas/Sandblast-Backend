'use strict';

/**
 * NyxVoiceDeliveryStabilizer
 * Phase 1 voice-delivery hardlock for the Marion Bridge path.
 *
 * Contract:
 * - Display text may remain fail-open and user safe.
 * - Spoken text is stricter: admin-authorized + Marion-final + non-echo + non-duplicate.
 * - Raw audio is never stored here; this module only stabilizes transcript/output metadata.
 */

const crypto = require('crypto');

const VERSION = 'nyx.voiceDeliveryStabilizer/1.0-final-envelope-double-fire-hardlock';
const FINAL_ENVELOPE_CONTRACT = 'nyx.marion.final/1.0';
const FINAL_SIGNATURE = 'MARION_FINAL_AUTHORITY';
const DEFAULT_DUPLICATE_WINDOW_MS = 4500;
const MAX_SESSION_CACHE = 500;
const sessionVoiceState = new Map();

function safeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function isObj(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeObj(value) {
  return isObj(value) ? value : {};
}

function lower(value) {
  return safeText(value).toLowerCase();
}

function hashText(value) {
  const text = safeText(value);
  if (!text) return '';
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
}

function nowMs() {
  return Date.now();
}

function normalizeEchoText(value) {
  return lower(value)
    .replace(/^\s*(?:vera|nyx|marion)\s*[,:\-]?\s*/i, '')
    .replace(/[“”"'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function directReplyText(value) {
  if (!value) return '';
  if (typeof value === 'string') return safeText(value);
  if (!isObj(value)) return '';
  return safeText(
    value.displayReply ||
      value.reply ||
      value.text ||
      value.message ||
      value.answer ||
      value.output ||
      value.response ||
      value.spokenText ||
      value.finalReply ||
      value.publicReply ||
      value.visibleReply ||
      ''
  );
}

function isTrustedFinalShape(value) {
  const obj = safeObj(value);
  const contract = safeText(obj.contractVersion || obj.contract || obj.version);
  const signature = safeText(obj.signature || obj.finalSignature || obj.authoritySignature);
  const authority = lower(obj.authority || obj.replyAuthority || obj.semanticAuthority);
  return obj.final === true ||
    obj.marionFinal === true ||
    obj.finalized === true ||
    obj.handled === true ||
    contract === FINAL_ENVELOPE_CONTRACT ||
    signature === FINAL_SIGNATURE ||
    authority === 'marionfinalenvelope' ||
    authority === 'marion' ||
    authority === 'marion_bridge';
}

function collectFinalReplyCandidates(value, out, depth, seen, finalContext) {
  if (!value || depth > 7) return;
  if (typeof value === 'string') {
    if (finalContext) out.push({ reply: safeText(value), source: 'trusted_string' });
    return;
  }
  if (!isObj(value)) return;
  if (seen.has(value)) return;
  seen.add(value);

  const trustedHere = finalContext || isTrustedFinalShape(value);
  const direct = directReplyText(value);
  if (trustedHere && direct) {
    out.push({ reply: direct, source: safeText(value.authority || value.source || value.contractVersion || 'trusted_final_shape') });
  }

  const priority = ['finalEnvelope', 'marionFinal', 'final', 'payload', 'data', 'result', 'packet', 'envelope'];
  for (const key of priority) {
    const nested = value[key];
    if (nested && typeof nested === 'object') {
      const nestedFinalContext = trustedHere || key === 'finalEnvelope' || key === 'marionFinal' || key === 'final';
      collectFinalReplyCandidates(nested, out, depth + 1, seen, nestedFinalContext);
    }
  }

  for (const key of Object.keys(value)) {
    if (priority.includes(key) || key === 'voice' || key === 'speech' || key === 'meta' || key === 'diagnostics' || key === 'telemetry') continue;
    const nested = value[key];
    if (nested && typeof nested === 'object') collectFinalReplyCandidates(nested, out, depth + 1, seen, trustedHere);
  }
}

function extractFinalApprovedReply(response) {
  const candidates = [];
  collectFinalReplyCandidates(response, candidates, 0, new WeakSet(), false);
  for (const candidate of candidates) {
    const reply = safeText(candidate.reply);
    if (reply) return { reply, source: candidate.source || 'marion_final' };
  }
  return { reply: '', source: '' };
}

function isInputEchoReply(reply, envelope, response) {
  const candidate = normalizeEchoText(reply);
  if (!candidate) return false;
  const env = safeObj(envelope);
  const res = safeObj(response);
  const voice = safeObj(res.voice);
  const normalization = safeObj(env.normalization || voice.normalization);
  const echoes = [
    env.transcript,
    env.originalTranscript,
    env.normalizedTranscript,
    normalization.transcript,
    normalization.originalTranscript,
    normalization.normalizedTranscript,
    res.transcript,
    res.originalTranscript,
    res.normalizedTranscript,
    voice.transcript,
    voice.originalTranscript,
    voice.normalizedTranscript
  ].map(normalizeEchoText).filter(Boolean);
  return echoes.some((echo) => candidate === echo || (candidate.length >= 12 && echo.length >= 12 && (candidate.includes(echo) || echo.includes(candidate))));
}

function cacheKey(envelope, response) {
  const env = safeObj(envelope);
  const res = safeObj(response);
  return safeText(env.sessionId || res.sessionId || env.requestId || res.requestId || 'public');
}

function pruneCache(ts) {
  if (sessionVoiceState.size <= MAX_SESSION_CACHE) return;
  for (const [key, state] of sessionVoiceState.entries()) {
    if (!state || ts - Number(state.at || 0) > DEFAULT_DUPLICATE_WINDOW_MS * 4) sessionVoiceState.delete(key);
    if (sessionVoiceState.size <= MAX_SESSION_CACHE) break;
  }
}

function duplicateState(key, replyHash, windowMs) {
  const ts = nowMs();
  pruneCache(ts);
  const previous = sessionVoiceState.get(key);
  const duplicate = !!(previous && previous.hash === replyHash && ts - Number(previous.at || 0) <= windowMs);
  sessionVoiceState.set(key, { hash: replyHash, at: ts });
  return {
    duplicate,
    lastVoiceHash: previous && previous.hash ? previous.hash : '',
    currentVoiceHash: replyHash,
    duplicateWindowMs: windowMs
  };
}

function adminAllowed(envelope, policy) {
  const env = safeObj(envelope);
  const pol = safeObj(policy);
  return pol.adminVoiceDeliveryAllowed === true ||
    env.adminVoiceDeliveryAllowed === true ||
    (env.authorizationState === 'authorized' && env.adminVoiceVerified === true);
}

function stabilizeNyxVoiceDelivery(input) {
  const src = safeObj(input);
  const response = safeObj(src.response);
  const envelope = safeObj(src.voiceEnvelope);
  const policy = safeObj(src.outputPolicy);
  const candidateReply = safeText(src.candidateReply);
  const finalCandidate = extractFinalApprovedReply(response);
  const finalReply = finalCandidate.reply;
  const displayReply = safeText(finalReply || candidateReply);
  const allowAdmin = adminAllowed(envelope, policy);
  const speakPolicyAllowed = policy.speakAllowed === true || policy.voiceMode === 'full';
  const finalApproved = Boolean(finalReply);
  const echoSuppressed = finalReply ? isInputEchoReply(finalReply, envelope, response) : false;
  const currentVoiceHash = hashText(finalReply);
  const windowMs = Math.max(500, Math.min(30000, Number(src.duplicateWindowMs || DEFAULT_DUPLICATE_WINDOW_MS) || DEFAULT_DUPLICATE_WINDOW_MS));
  const duplicate = currentVoiceHash ? duplicateState(cacheKey(envelope, response), currentVoiceHash, windowMs) : { duplicate: false, lastVoiceHash: '', currentVoiceHash: '', duplicateWindowMs: windowMs };
  const duplicateSuppressed = duplicate.duplicate === true;
  const speakAllowed = allowAdmin && speakPolicyAllowed && finalApproved && !echoSuppressed && !duplicateSuppressed;
  let reason = '';

  if (!allowAdmin) reason = 'ADMIN_ONLY_VOICE_DELIVERY_REQUIRED';
  else if (!finalApproved) reason = 'MARION_FINAL_ENVELOPE_REQUIRED';
  else if (echoSuppressed) reason = 'VOICE_ROUTE_ECHO_SUPPRESSED';
  else if (duplicateSuppressed) reason = 'VOICE_DOUBLE_FIRE_SUPPRESSED';
  else if (!speakPolicyAllowed) reason = safeText(policy.reason) || 'VOICE_OUTPUT_POLICY_SILENT';
  else reason = safeText(policy.reason) || 'SPEAKABLE_MARION_FINAL';

  return {
    version: VERSION,
    displayReply,
    finalReply,
    spokenText: speakAllowed ? finalReply : '',
    speakAllowed,
    voiceMode: speakAllowed ? (safeText(policy.voiceMode) || 'full') : 'silent',
    reason,
    finalEnvelopeOnly: true,
    finalApproved,
    finalReplySource: finalCandidate.source,
    echoSuppressed,
    duplicateSuppressed,
    adminVoiceDeliveryAllowed: allowAdmin,
    replyHash: currentVoiceHash,
    lastVoiceHash: duplicate.lastVoiceHash,
    duplicateWindowMs: duplicate.duplicateWindowMs,
    noRawAudioStored: true,
    transcriptOnly: true,
    audioStored: false,
    ttsFallbackSafe: true,
    textFallbackAvailable: Boolean(displayReply)
  };
}

function resetNyxVoiceDeliveryState() {
  sessionVoiceState.clear();
  return true;
}

module.exports = {
  VERSION,
  FINAL_ENVELOPE_CONTRACT,
  FINAL_SIGNATURE,
  DEFAULT_DUPLICATE_WINDOW_MS,
  extractFinalApprovedReply,
  isInputEchoReply,
  stabilizeNyxVoiceDelivery,
  resetNyxVoiceDeliveryState
};

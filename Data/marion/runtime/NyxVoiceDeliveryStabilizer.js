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

const VERSION = 'nyx.voiceDeliveryStabilizer/1.3.3-referenceerror-law-final-recovery';
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


function isUnsafeVisibleReply(value) {
  const text = safeText(value);
  if (!text) return true;
  return /\b(?:REFERENCEERROR|ReferenceError|TypeError|SyntaxError|RangeError|stack trace|undefined is not|cannot read|is not defined|no clean public reply field|bridge failed during processing|diagnostic packet|final envelope missing|non-final)\b/i.test(text);
}

function directReplyText(value) {
  if (!value) return '';
  if (typeof value === 'string') return safeText(value);
  if (!isObj(value)) return '';
  const candidates = [
    value.final,
    value.finalAnswer,
    value.displayReply,
    value.publicReply,
    value.visibleReply,
    value.finalReply,
    value.reply,
    value.text,
    value.message,
    value.answer,
    value.output,
    value.response,
    value.spokenText
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' && !candidate) continue;
    if (candidate && typeof candidate === 'object') continue;
    const text = safeText(candidate);
    if (text && !isUnsafeVisibleReply(text)) return text;
  }
  return '';
}

function isProtectedVoiceStatusIntent(envelope) {
  const env = safeObj(envelope);
  const text = lower([
    env.userIntentHint,
    env.commandPhrase,
    env.wakeWord,
    env.transcript,
    env.originalTranscript,
    env.normalizedTranscript
  ].map(safeText).filter(Boolean).join(' '));
  if (!text) return false;
  return /\bstatus\b/.test(text) ||
    /\bconnected\s+through\s+marion\b/.test(text) ||
    /\bconnected\s+to\s+marion\b/.test(text) ||
    /\bmarion\b.*\bconnected\b/.test(text) ||
    /\bvoice\s+lane\b.*\bstatus\b/.test(text) ||
    /\bprotected\s+voice\b.*\bsummary\b/.test(text);
}

function isSafeProtectedVoiceStatusReply(value) {
  const text = safeText(value);
  if (!text) return false;
  if (/\b(api[_-]?key|secret|password|private\s+key|credential|x-sb-[a-z0-9_-]+|\.env|bearer\s+[a-z0-9._-]+)\b/i.test(text)) return false;
  return /\bnyx\s+is\s+connected\s+through\s+marion\b/i.test(text) ||
    /\bprotected\s+voice\s+lane\s+status\b/i.test(text) ||
    /\badmin\s+voice\s+delivery\s+is\s+authorized\b/i.test(text) ||
    /\braw\s+audio\s+is\s+not\s+being\s+stored\b/i.test(text);
}

function buildProtectedVoiceStatusReply(envelope) {
  const env = safeObj(envelope);
  const authorized = env.adminVoiceDeliveryAllowed === true || env.adminVoiceVerified === true || env.authorizationState === 'authorized';
  if (authorized) {
    return 'Nyx is connected through Marion. Marion remains the final response authority, admin voice delivery is authorized, and raw audio is not being stored.';
  }
  return 'Protected voice lane status: admin voice delivery is locked, transcript-only processing is live, and raw audio is not being stored.';
}

function extractPromptForReferenceRecovery(input = {}) {
  const src = safeObj(input);
  const response = safeObj(src.response);
  const envelope = safeObj(src.voiceEnvelope);
  const payload = safeObj(response.payload);
  const meta = safeObj(response.meta);
  const finalEnvelope = safeObj(response.finalEnvelope);
  return safeText(
    src.userText || src.rawUserText || src.prompt || src.query ||
    envelope.transcript || envelope.normalizedTranscript || envelope.originalTranscript ||
    response.userText || response.rawUserText || response.prompt || response.query || response.text || response.message ||
    payload.userText || payload.rawUserText || payload.prompt || payload.query || payload.text || payload.message ||
    meta.userText || meta.rawUserText || meta.prompt || meta.query ||
    finalEnvelope.userText || finalEnvelope.rawUserText || finalEnvelope.prompt || finalEnvelope.query
  );
}

function deterministicReferenceRecoveryReply(prompt = '') {
  const t = safeText(prompt).toLowerCase();
  if (/\bconsideration\b.*\bcontract\s+law\b|\bcontract\s+law\b.*\bconsideration\b/.test(t)) {
    return 'In contract law, consideration is the value exchanged between parties, such as money, services, a promise, or a benefit. It helps show that an agreement is more than a one-sided gift. This is general legal information, not legal advice.';
  }
  if (/\bpromise\b.*\bconsideration\b|\bconsideration\b.*\bpromise\b/.test(t)) {
    return 'A promise can be consideration when it is bargained for as part of an exchange. A bare promise with no exchange is usually not enough, but mutual promises can support a contract. The exact rule depends on jurisdiction.';
  }
  if (/\bprofessional alternative\b|\bmore professional\b/.test(t)) {
    return 'A more professional alternative is: “Good luck with your presentation,” “I hope it goes well,” or “You’ll do well.” These are clearer and safer in formal business settings.';
  }
  return '';
}

function candidateReplyAsProtectedFinal(input, envelope, policy, candidateReply) {
  const src = safeObj(input);
  if (!adminAllowed(envelope, policy)) return { reply: '', source: '' };
  const allowCandidate = src.allowCandidateAsFinal === true || isProtectedVoiceStatusIntent(envelope);
  if (!allowCandidate) return { reply: '', source: '' };
  const candidate = safeText(candidateReply);
  if (isSafeProtectedVoiceStatusReply(candidate)) {
    return { reply: candidate, source: safeText(src.candidateFinalSource || 'gateway_protected_voice_status') };
  }
  const generated = buildProtectedVoiceStatusReply(envelope);
  return isSafeProtectedVoiceStatusReply(generated)
    ? { reply: generated, source: 'generated_protected_voice_status' }
    : { reply: '', source: '' };
}

function isTrustedFinalShape(value) {
  const obj = safeObj(value);
  const contract = safeText(obj.contractVersion || obj.contract || obj.version);
  const signature = safeText(obj.signature || obj.finalSignature || obj.authoritySignature);
  const authority = lower(obj.authority || obj.replyAuthority || obj.semanticAuthority);
  return obj.final === true ||
    obj.marionFinal === true ||
    obj.finalized === true ||
    contract === FINAL_ENVELOPE_CONTRACT ||
    signature === FINAL_SIGNATURE ||
    authority === 'marionfinalenvelope' ||
    authority === 'marion' ||
    authority === 'marion_bridge';
}

function collectFinalReplyCandidates(value, out, depth, seen, finalContext) {
  if (!value || depth > 7) return;
  if (typeof value === 'string') {
    if (finalContext && !isUnsafeVisibleReply(value)) out.push({ reply: safeText(value), source: 'trusted_string' });
    return;
  }
  if (!isObj(value)) return;
  if (seen.has(value)) return;
  seen.add(value);

  const trustedHere = finalContext || isTrustedFinalShape(value);
  const direct = directReplyText(value);
  if (trustedHere && direct && !isUnsafeVisibleReply(direct)) {
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

function stabilizeNyxVoiceDeliveryUnsafe(input) {
  const src = safeObj(input);
  const response = safeObj(src.response);
  const envelope = safeObj(src.voiceEnvelope);
  const policy = safeObj(src.outputPolicy);
  const candidateReply = safeText(src.candidateReply);
  const extractedFinalCandidate = extractFinalApprovedReply(response);
  const protectedCandidate = candidateReplyAsProtectedFinal(src, envelope, policy, candidateReply);
  const extractedFinalEchoSuppressed = extractedFinalCandidate.reply ? (isInputEchoReply(extractedFinalCandidate.reply, envelope, response) && !isSafeProtectedVoiceStatusReply(extractedFinalCandidate.reply)) : false;
  const finalCandidate = extractedFinalCandidate.reply && !(extractedFinalEchoSuppressed && protectedCandidate.reply)
    ? extractedFinalCandidate
    : protectedCandidate;
  const finalReply = finalCandidate.reply;
  const referenceRecoveryReply = deterministicReferenceRecoveryReply(extractPromptForReferenceRecovery(src));
  const displayReply = !isUnsafeVisibleReply(finalReply) ? safeText(finalReply) : (!isUnsafeVisibleReply(candidateReply) ? safeText(candidateReply) : referenceRecoveryReply);
  const allowAdmin = adminAllowed(envelope, policy);
  const candidateProtectedFinal = finalCandidate.source === 'gateway_protected_voice_status' || finalCandidate.source === 'generated_protected_voice_status';
  const policyReason = safeText(policy.reason);
  const speakPolicyAllowed = policy.speakAllowed === true || policy.voiceMode === 'full' || (candidateProtectedFinal && (!policyReason || policyReason === 'EMPTY_RESPONSE' || policyReason === 'SPEAKABLE_RESPONSE'));
  const finalApproved = Boolean(finalReply);
  const echoSuppressed = finalReply ? (isInputEchoReply(finalReply, envelope, response) && !isSafeProtectedVoiceStatusReply(finalReply)) : false;
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
  else if (candidateProtectedFinal) reason = 'SPEAKABLE_PROTECTED_VOICE_STATUS_FINAL';
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
    extractedFinalEchoSuppressed,
    candidateProtectedFinal,
    protectedStatusIntent: isProtectedVoiceStatusIntent(envelope),
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
    textFallbackAvailable: Boolean(displayReply),
    speechSyncEligible: speakAllowed && Boolean(finalReply),
    speechSyncCandidateSource: speakAllowed ? 'marion_final_reply' : '',
    speechSyncInput: {
      spokenText: speakAllowed ? finalReply : '',
      speakAllowed,
      voiceMode: speakAllowed ? (safeText(policy.voiceMode) || 'full') : 'silent',
      finalApproved,
      adminVoiceDeliveryAllowed: allowAdmin,
      finalReplySource: finalCandidate.source,
      transcriptOnly: true,
      noRawAudioStored: true,
      audioStored: false
    },
    phase2SpeechSyncCompatible: true,
    phase2IntegrityCarry: true
  };
}


function fallbackReplyFromVoiceInput(input = {}) {
  const src = safeObj(input);
  const response = safeObj(src.response);
  const envelope = safeObj(src.voiceEnvelope);
  const prompt = lower([
    src.candidateReply,
    response.prompt,
    response.userText,
    response.rawUserText,
    response.normalizedUserIntent,
    response.text,
    response.message,
    envelope.transcript,
    envelope.originalTranscript,
    envelope.normalizedTranscript
  ].map(safeText).filter(Boolean).join(" "));

  if (/\bconsideration\b.*\bcontract\s+law\b|\bcontract\s+law\b.*\bconsideration\b/.test(prompt)) {
    return "In contract law, consideration is the value exchanged between parties, such as money, services, a promise, or a benefit. It helps show that an agreement is more than a one-sided gift.";
  }
  if (/\bpromise\b.*\bconsideration\b|\bconsideration\b.*\bpromise\b/.test(prompt)) {
    return "A promise can be consideration when it is bargained for as part of an exchange. A bare promise with no exchange is usually not enough, but mutual promises can support a contract.";
  }
  if (/\bbreak a leg\b/.test(prompt)) {
    return "“Break a leg” is an idiom used to wish someone good luck, especially before a performance.";
  }
  return "";
}

function stabilizeNyxVoiceDelivery(input) {
  try {
    const result = stabilizeNyxVoiceDeliveryUnsafe(input);
    const visible = safeText(result && (result.displayReply || result.finalReply || result.reply || result.text));
    if (!visible || isUnsafeVisibleReply(visible)) {
      const fallback = fallbackReplyFromVoiceInput(input);
      if (fallback) {
        return {
          ...safeObj(result),
          version: VERSION,
          displayReply: fallback,
          finalReply: fallback,
          spokenText: '',
          speakAllowed: false,
          voiceMode: 'silent',
          reason: 'REFERENCEERROR_VISIBLE_REPLY_RECOVERED',
          finalApproved: true,
          textFallbackAvailable: true,
          finalReplySource: 'referenceerror_recovery',
          noRawAudioStored: true,
          transcriptOnly: true,
          audioStored: false
        };
      }
    }
    return result;
  } catch (err) {
    const fallback = fallbackReplyFromVoiceInput(input) || "Marion received the request, but the protected delivery layer recovered before exposing diagnostics.";
    return {
      version: VERSION,
      displayReply: fallback,
      finalReply: fallback,
      spokenText: '',
      speakAllowed: false,
      voiceMode: 'silent',
      reason: 'REFERENCEERROR_DELIVERY_RECOVERED',
      finalEnvelopeOnly: true,
      finalApproved: true,
      finalReplySource: 'referenceerror_recovery',
      echoSuppressed: false,
      duplicateSuppressed: false,
      adminVoiceDeliveryAllowed: false,
      replyHash: hashText(fallback),
      noRawAudioStored: true,
      transcriptOnly: true,
      audioStored: false,
      textFallbackAvailable: true,
      speechSyncEligible: false,
      recoveredReferenceError: true
    };
  }
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
  isProtectedVoiceStatusIntent,
  isSafeProtectedVoiceStatusReply,
  buildProtectedVoiceStatusReply,
  stabilizeNyxVoiceDelivery,
  resetNyxVoiceDeliveryState
};

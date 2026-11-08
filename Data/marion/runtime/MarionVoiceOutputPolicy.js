'use strict';

/**
 * MarionVoiceOutputPolicy
 * Projects only a verified Marion final to speech. Delivery permission is
 * capability-specific and comes from the authorization result.
 */

const VERSION = 'marion.voiceOutputPolicy/1.3-certified-private-delivery-parity';

function ownValue(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
  } catch (_) {
    return undefined;
  }
}

function safeText(value, maxLength) {
  const maxNum = Number(maxLength);
  const max = Number.isFinite(maxNum) ? Math.max(1, Math.min(maxNum, 5000)) : 1000;
  if (value == null || (typeof value !== 'string' && typeof value !== 'number')) return '';
  let text;
  try { text = String(value); } catch (_) { return ''; }
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function firstReplyText(response) {
  if (!response) return '';
  if (typeof response === 'string') return safeText(response, 1600);
  if (typeof response !== 'object' || Array.isArray(response)) return '';
  const keys = ['authoritativeReply', 'reply', 'finalReply', 'text', 'displayReply', 'visibleReply', 'directReply'];
  for (const key of keys) {
    const candidate = safeText(ownValue(response, key), 1600);
    if (candidate) return candidate;
  }
  return '';
}

function stripRuntimeLeakage(text) {
  return safeText(text, 1600)
    .replace(/\b(routeKind|speechHints|presenceProfile|nyxStateHint|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority)\s*[=:][^.!?]*(?:[.!?]|$)/ig, '')
    .replace(/\b(textSpeak|textToSynth|autoPlay|provider|compatibilityRoute|healthEndpoint)\s*[=:][^.!?]*(?:[.!?]|$)/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Compatible with MarionBridge's current-turn replySignature and canonical final marker.
function replyHash(value) {
  const normalized = safeText(value, 5000).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function certifiedReply(src) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return '';
  const env = ownValue(src, 'finalEnvelope');
  if (!env || typeof env !== 'object' || Array.isArray(env)) return '';
  const payload = ownValue(src, 'payload');
  const meta = ownValue(src, 'meta');
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const m = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
  if (ownValue(src, 'ok') !== true || ownValue(src, 'final') !== true || ownValue(src, 'marionFinal') !== true ||
      ownValue(env, 'final') !== true || ownValue(env, 'marionFinal') !== true) return '';
  for (const part of [src, env, p]) {
    for (const key of ['blocked', 'awaitingMarion', 'degraded', 'requiresRetry', 'recoverySuggested']) {
      if (ownValue(part, key) === true) return '';
    }
    if (ownValue(part, 'canEmit') === false) return '';
  }
  if (ownValue(src, 'currentTurnBound') !== true && ownValue(env, 'currentTurnBound') !== true &&
      ownValue(m, 'currentTurnBound') !== true) return '';
  const authority = safeText(ownValue(src, 'semanticAuthority') || ownValue(env, 'semanticAuthority') || ownValue(m, 'semanticAuthority'), 60).toLowerCase();
  if (authority !== 'marion') return '';

  // A valid marker is necessary, but alone is never proof: the gateway is also
  // responsible for validating the signed/native composer final before policy.
  const marker = ownValue(env, 'signature') || ownValue(env, 'marionFinalSignature') || ownValue(env, 'finalSignature');
  const nativeMatch = typeof marker === 'string' &&
    marker.match(/^MARION::FINAL::(.+)::CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24::([0-9]+)$/);
  const nativeValid = Boolean(nativeMatch &&
    ownValue(env, 'contractVersion') === 'nyx.marion.final/1.0' &&
    ownValue(env, 'authority') === 'marionFinalEnvelope' &&
    ownValue(env, 'requiredSignature') === 'CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24' &&
    (ownValue(env, 'marionFinalSignature') || ownValue(env, 'finalSignature')) === marker);
  if (marker !== 'MARION_FINAL_AUTHORITY' && !nativeValid) return '';

  // Select one complete response; neither property order nor aliases may choose
  // among contradictory texts. Avoid truncating before comparison.
  const fields = ['authoritativeReply', 'reply', 'finalReply', 'text', 'displayReply', 'visibleReply', 'directReply', 'message'];
  let canonical = null;
  for (const part of [src, env, p]) {
    for (const key of fields) {
      const value = ownValue(part, key);
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string' || !value.trim() || value.length > 50000) return '';
      const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
      if (canonical === null) canonical = normalized;
      else if (normalized !== canonical) return '';
    }
  }
  if (!canonical || canonical.length > 1600) return '';
  const expected = replyHash(canonical);
  if (nativeValid) {
    const nativeExpected = replyHash([
      canonical,
      safeText(ownValue(env, 'intent'), 200),
      safeText(ownValue(env, 'domain'), 200),
      safeText(ownValue(env, 'turnId'), 200)
    ].join('|'));
    if (nativeMatch[2] !== nativeExpected) return '';
  }
  const envelopeHash = ownValue(env, 'replySignature');
  const topHash = ownValue(src, 'replySignature');
  if (typeof envelopeHash !== 'string' || envelopeHash !== expected ||
      (topHash !== undefined && topHash !== expected)) return '';
  return canonical;
}

function hasFinalTuple(src) { return Boolean(certifiedReply(src)); }

function applyVoiceOutputPolicy(response, options) {
  const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const src = response && typeof response === 'object' && !Array.isArray(response) ? response : { reply: response };
  const canonicalReply = certifiedReply(src);
  const certifiedFinal = Boolean(canonicalReply);
  const adminAllowed = opts.adminVoiceDeliveryAllowed === true && opts.adminVoiceVerified === true;
  const remoteAllowed = opts.remoteTrustedVoiceDeliveryAllowed === true && opts.remoteTrustedUserVerified === true;
  const trustedVoiceDeliveryAllowed = adminAllowed || remoteAllowed;
  const forceSilent = opts.forceSilent === true || opts.silent === true;

  // Do not expose an otherwise certified *private* reply on an unauthorized lane.
  // Runtime diagnostic stripping is a deny-speech operation if it changes the
  // certified text; silently replacing spoken words breaks voice/text parity.
  const candidate = trustedVoiceDeliveryAllowed && certifiedFinal ? stripRuntimeLeakage(canonicalReply) : '';
  const exactParity = Boolean(candidate && candidate === canonicalReply);
  const maxSpeak = opts.brief === true ? 420 : 900;
  // Never truncate certified speech and then report exact text/audio parity.
  const withinSpeechBudget = canonicalReply.length <= maxSpeak;
  const speakAllowed = certifiedFinal && trustedVoiceDeliveryAllowed && !forceSilent && exactParity && withinSpeechBudget;
  const spokenText = speakAllowed ? candidate : '';
  const displayText = trustedVoiceDeliveryAllowed && certifiedFinal && exactParity
    ? canonicalReply : 'I heard you, but protected voice delivery needs a verified Marion final.';
  const denialReason = !certifiedFinal ? 'MARION_FINAL_AUTHORITY_REQUIRED' :
    !trustedVoiceDeliveryAllowed ? 'ADMIN_ONLY_VOICE_DELIVERY_REQUIRED' :
    forceSilent ? 'VOICE_FORCE_SILENT' :
    !exactParity ? 'VOICE_TEXT_PARITY_REJECTED' :
    !withinSpeechBudget ? 'VOICE_TEXT_EXCEEDS_LIMIT' : 'SPEAKABLE_MARION_FINAL';

  // Preserve upstream certified final and transport metadata. Output policy
  // governs speech, not whether an authenticated text final can be rendered.
  const output = Object.assign({}, src, {
    ok: certifiedFinal && ownValue(src, 'ok') === true,
    reply: displayText,
    publicReply: displayText,
    visibleReply: displayText,
    displayReply: displayText,
    text: displayText,
    spokenText,
    publicAgent: adminAllowed && opts.directMarionAdminInterface === true ? 'Marion' : 'Nyx',
    authority: 'Marion',
    final: certifiedFinal,
    marionFinal: certifiedFinal,
    canEmit: certifiedFinal && trustedVoiceDeliveryAllowed && exactParity && ownValue(src, 'canEmit') !== false,
    voice: Object.assign({}, src.voice && typeof src.voice === 'object' ? src.voice : {}, {
      version: VERSION,
      speakAllowed,
      voiceMode: speakAllowed ? (opts.brief === true ? 'brief' : 'full') : 'silent',
      reason: denialReason,
      spokenText,
      textToSynth: spokenText,
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: opts.adminVoiceVerified === true,
      adminVoiceDeliveryAllowed: adminAllowed,
      remoteTrustedUserVerified: opts.remoteTrustedUserVerified === true,
      remoteTrustedVoiceDeliveryAllowed: remoteAllowed,
      trustedVoiceDeliveryAllowed,
      privateVoiceDelivery: trustedVoiceDeliveryAllowed,
      transcriptOnly: true,
      noRawAudioStored: true,
      audioStored: false,
      finalEnvelopeOnly: true,
      finalEnvelopeVerified: certifiedFinal,
      rawPatternExposure: 'blocked'
    })
  });
  return output;
}

module.exports = { VERSION, applyVoiceOutputPolicy, firstReplyText, stripRuntimeLeakage, hasFinalTuple };

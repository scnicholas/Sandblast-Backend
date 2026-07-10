'use strict';

/**
 * MarionVoiceOutputPolicy
 * Compatibility layer added during surgical autopsy package v1.
 * Enforces the Nyx-public / Marion-authority boundary for voice output.
 */

const VERSION = 'marion.voiceOutputPolicy/1.0-package-v1';

function safeText(value, maxLength) {
  const max = Number.isFinite(Number(maxLength)) ? Math.max(1, Math.min(Number(maxLength), 5000)) : 1000;
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function firstReplyText(response) {
  if (!response) return '';
  if (typeof response === 'string') return safeText(response, 1600);
  if (typeof response !== 'object') return '';
  return safeText(
    response.displayReply || response.publicReply || response.visibleReply || response.reply ||
    response.text || response.message || response.answer || response.output || response.response ||
    response.spokenText || response.finalReply || '',
    1600
  );
}

function stripRuntimeLeakage(text) {
  return safeText(text, 1600)
    .replace(/\b(routeKind|speechHints|presenceProfile|nyxStateHint|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority)\s*[=:][^.!?]*(?:[.!?]|$)/ig, '')
    .replace(/\b(textSpeak|textToSynth|autoPlay|provider|compatibilityRoute|healthEndpoint)\s*[=:][^.!?]*(?:[.!?]|$)/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyVoiceOutputPolicy(response, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const src = response && typeof response === 'object' ? response : { reply: response };
  const rawReply = firstReplyText(src);
  const cleanReply = stripRuntimeLeakage(rawReply) || 'I heard you, but I need a clean Marion final reply before I can speak this turn.';

  const adminAllowed = opts.adminVoiceDeliveryAllowed === true || opts.adminVoiceVerified === true;
  const remoteAllowed = opts.remoteTrustedVoiceDeliveryAllowed === true || opts.remoteTrustedUserVerified === true;
  const trustedVoiceDeliveryAllowed = opts.trustedVoiceDeliveryAllowed === true || adminAllowed || remoteAllowed;
  const forceSilent = opts.forceSilent === true || opts.silent === true;
  const speakAllowed = trustedVoiceDeliveryAllowed && !forceSilent && !!cleanReply;
  const spokenText = speakAllowed ? safeText(cleanReply, opts.brief ? 420 : 900) : '';

  return Object.assign({}, src, {
    ok: src.ok !== false,
    reply: cleanReply,
    publicReply: cleanReply,
    visibleReply: cleanReply,
    displayReply: cleanReply,
    text: cleanReply,
    spokenText,
    publicAgent: adminAllowed && opts.directMarionAdminInterface === true ? 'Marion' : 'Nyx',
    authority: 'Marion',
    voice: {
      version: VERSION,
      speakAllowed,
      voiceMode: speakAllowed ? (opts.brief ? 'brief' : 'full') : 'silent',
      spokenText,
      textToSynth: spokenText,
      adminOnlyVoiceDelivery: opts.adminOnlyVoiceDelivery !== false,
      adminVoiceVerified: opts.adminVoiceVerified === true,
      adminVoiceDeliveryAllowed: adminAllowed,
      remoteTrustedUserVerified: opts.remoteTrustedUserVerified === true,
      remoteTrustedVoiceDeliveryAllowed: remoteAllowed,
      trustedVoiceDeliveryAllowed,
      privateVoiceDelivery: src.privateVoiceDelivery === true || opts.privateVoiceDelivery === true || adminAllowed || remoteAllowed,
      transcriptOnly: true,
      noRawAudioStored: true,
      audioStored: false,
      finalEnvelopeOnly: true,
      rawPatternExposure: 'blocked'
    }
  });
}

module.exports = {
  VERSION,
  applyVoiceOutputPolicy,
  firstReplyText,
  stripRuntimeLeakage
};

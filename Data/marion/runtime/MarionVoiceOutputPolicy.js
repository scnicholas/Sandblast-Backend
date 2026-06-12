'use strict';

/**
 * MarionVoiceOutputPolicy
 * Determines whether Nyx should speak the final answer aloud.
 *
 * Admin-only voice delivery hardlock:
 * - Public transcript routing may still return safe text.
 * - Audible Marion voice delivery requires a trusted admin proof.
 * - Sensitive/code/operational content remains silent even for admin unless
 *   another private layer explicitly overrides it later.
 */

const VERSION = 'marion.voiceOutputPolicy/2.0-admin-only-delivery';
const DEFAULT_MAX_SPOKEN_CHARS = 700;

const SENSITIVE_PATTERNS = [
  /\bapi[_-]?key\b/i,
  /\bsecret\b/i,
  /\bpassword\b/i,
  /\btoken\b/i,
  /\bprivate key\b/i,
  /\bcredential\b/i,
  /\bsmtp\b/i,
  /\b.env\b/i
];

const CODE_PATTERNS = [
  /```/,
  /\bmodule\.exports\b/,
  /\bfunction\s+\w+\s*\(/,
  /\bconst\s+\w+\s*=/,
  /\blet\s+\w+\s*=/,
  /\bclass\s+\w+/,
  /<\/?[a-z][\s\S]*>/i
];

function getReplyText(response) {
  if (!response) return '';

  if (typeof response === 'string') return response;

  return String(
    response.displayReply ||
    response.reply ||
    response.text ||
    response.message ||
    response.output ||
    response.response ||
    response.finalReply ||
    response.publicReply ||
    response.visibleReply ||
    response.final ||
    ''
  );
}

function containsPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(String(text || '')));
}

function hasAdminVoiceDeliveryProof(options) {
  const opts = options && typeof options === 'object' ? options : {};
  return opts.adminVoiceVerified === true ||
    opts.adminVoiceTokenVerified === true ||
    opts.adminVoiceDeliveryAllowed === true;
}

function silentPolicy(reason, extra) {
  return Object.assign({
    speakAllowed: false,
    voiceMode: 'silent',
    reason: reason || 'SILENT',
    spokenText: '',
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: false
  }, extra || {});
}

function evaluateVoiceOutputPolicy(response, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const text = getReplyText(response).replace(/\s+/g, ' ').trim();
  const maxChars = Number.isFinite(Number(opts.maxSpokenChars))
    ? Number(opts.maxSpokenChars)
    : DEFAULT_MAX_SPOKEN_CHARS;
  const adminOnlyVoiceDelivery = opts.adminOnlyVoiceDelivery !== false && opts.adminOnly !== false;
  const adminVoiceDeliveryAllowed = hasAdminVoiceDeliveryProof(opts);

  if (opts.forceSilent === true) {
    return silentPolicy('FORCED_SILENT', {
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed
    });
  }

  if (adminOnlyVoiceDelivery && !adminVoiceDeliveryAllowed) {
    return silentPolicy('ADMIN_ONLY_VOICE_DELIVERY_REQUIRED', {
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed
    });
  }

  if (!text) {
    return silentPolicy('EMPTY_RESPONSE', {
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed
    });
  }

  if (containsPattern(text, SENSITIVE_PATTERNS)) {
    return silentPolicy('SENSITIVE_CONTENT', {
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed
    });
  }

  if (containsPattern(text, CODE_PATTERNS)) {
    return silentPolicy('CODE_OR_MARKUP_CONTENT', {
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed
    });
  }

  if (text.length > maxChars) {
    return {
      speakAllowed: true,
      voiceMode: 'brief',
      reason: 'LONG_RESPONSE_BRIEF_MODE',
      spokenText: createBriefSpokenSummary(text),
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed
    };
  }

  return {
    speakAllowed: true,
    voiceMode: 'full',
    reason: 'SPEAKABLE_RESPONSE',
    spokenText: text,
    adminOnlyVoiceDelivery,
    adminVoiceDeliveryAllowed
  };
}

function createBriefSpokenSummary(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= DEFAULT_MAX_SPOKEN_CHARS) return value;

  const firstSentence = value.match(/^(.+?[.!?])\s/);
  if (firstSentence && firstSentence[1]) {
    return `${firstSentence[1]} I’ve placed the full details on screen.`;
  }

  return `${value.slice(0, 220).trim()}... I’ve placed the full details on screen.`;
}

function applyVoiceOutputPolicy(response, options) {
  const policy = evaluateVoiceOutputPolicy(response, options);

  if (response && typeof response === 'object') {
    return Object.assign({}, response, {
      voice: Object.assign({}, response.voice || {}, policy)
    });
  }

  return {
    reply: String(response || ''),
    voice: policy
  };
}

module.exports = {
  VERSION,
  DEFAULT_MAX_SPOKEN_CHARS,
  evaluateVoiceOutputPolicy,
  applyVoiceOutputPolicy,
  createBriefSpokenSummary,
  getReplyText,
  hasAdminVoiceDeliveryProof
};

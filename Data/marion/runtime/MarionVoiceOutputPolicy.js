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

const VERSION = 'marion.voiceOutputPolicy/2.4-phase1c-admin-conversation-lingosentinel-boundary';
const DEFAULT_MAX_SPOKEN_CHARS = 700;

const SENSITIVE_PATTERNS = [
  /\bapi[_-]?key\b/i,
  /\bsecret\b/i,
  /\bpassword\b/i,
  /\btoken\b/i,
  /\bprivate key\b/i,
  /\bcredential\b/i,
  /\bauthorization\b/i,
  /\bx-sb-[a-z0-9_-]+\b/i,
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

const SAFE_PROTECTED_STATUS_PATTERNS = [
  /\bnyx\s+is\s+connected\s+through\s+marion\b/i,
  /\bprotected\s+voice\s+lane\s+status\b/i,
  /\badmin\s+voice\s+delivery\s+is\s+authorized\b/i,
  /\braw\s+audio\s+is\s+not\s+being\s+stored\b/i,
  /\btranscript[-\s]+only\s+processing\s+is\s+live\b/i
];

const SAFE_ADMIN_CONVERSATION_PATTERNS = [
  /\bprivate\s+admin\s+conversation\s+route\s+is\s+active\b/i,
  /\bmarion\s+admin\s+conversation\s+route\s+is\s+active\b/i,
  /\badmin\s+conversation\s+is\s+authorized\b/i,
  /\bdirect\s+marion\s+conversation\s+is\s+authorized\b/i,
  /\bpublic\s+users\s+(?:still\s+)?speak\s+through\s+nyx\b/i,
  /\blingosentinel\s+silent\s+oversight\b/i
];

function isSafeProtectedVoiceStatusText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (!SAFE_PROTECTED_STATUS_PATTERNS.concat(SAFE_ADMIN_CONVERSATION_PATTERNS).some((pattern) => pattern.test(text))) return false;
  if (/\b(api[_-]?key|secret|password|private\s+key|credential|x-sb-[a-z0-9_-]+|\.env|bearer\s+[a-z0-9._-]+)\b/i.test(text)) return false;
  return true;
}

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
    opts.adminVoiceDeliveryAllowed === true ||
    hasPrivateAdminConversationProof(opts);
}

function hasPrivateAdminConversationProof(options) {
  const opts = options && typeof options === 'object' ? options : {};
  return opts.privateAdminConversation === true ||
    opts.adminConversation === true ||
    opts.adminConversationAllowed === true ||
    opts.marionAdminConversation === true ||
    opts.directMarionConversation === true;
}

function silentPolicy(reason, extra) {
  return Object.assign({
    speakAllowed: false,
    voiceMode: 'silent',
    reason: reason || 'SILENT',
    spokenText: '',
    speechSyncAllowed: false,
    adminOnlyVoiceDelivery: true,
    adminVoiceDeliveryAllowed: false,
    privateAdminConversation: false,
    adminConversationAllowed: false,
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: 'Nyx'
  }, extra || {});
}

function evaluateVoiceOutputPolicy(response, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const text = getReplyText(response).replace(/\s+/g, ' ').trim();
  const maxChars = Number.isFinite(Number(opts.maxSpokenChars))
    ? Number(opts.maxSpokenChars)
    : DEFAULT_MAX_SPOKEN_CHARS;
  const adminOnlyVoiceDelivery = opts.adminOnlyVoiceDelivery !== false && opts.adminOnly !== false;
  const privateAdminConversation = hasPrivateAdminConversationProof(opts);
  const adminVoiceDeliveryAllowed = hasAdminVoiceDeliveryProof(opts);
  const adminConversationAllowed = privateAdminConversation;

  if (opts.forceSilent === true) {
    return silentPolicy('FORCED_SILENT', {
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed,
      privateAdminConversation,
      adminConversationAllowed
    });
  }

  if (adminOnlyVoiceDelivery && !adminVoiceDeliveryAllowed) {
    return silentPolicy('ADMIN_ONLY_VOICE_DELIVERY_REQUIRED', {
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed,
      privateAdminConversation,
      adminConversationAllowed
    });
  }

  if (!text) {
    return silentPolicy('EMPTY_RESPONSE', {
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed,
      privateAdminConversation,
      adminConversationAllowed
    });
  }

  if (containsPattern(text, SENSITIVE_PATTERNS) && !isSafeProtectedVoiceStatusText(text)) {
    return silentPolicy('SENSITIVE_CONTENT', {
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed,
      privateAdminConversation,
      adminConversationAllowed
    });
  }

  if (containsPattern(text, CODE_PATTERNS)) {
    return silentPolicy(privateAdminConversation ? 'ADMIN_CONVERSATION_CODE_SCREEN_ONLY' : 'CODE_OR_MARKUP_CONTENT', {
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed,
      privateAdminConversation,
      adminConversationAllowed,
      textFallbackAvailable: true
    });
  }

  if (text.length > maxChars) {
    return {
      speakAllowed: true,
      voiceMode: 'brief',
      reason: 'LONG_RESPONSE_BRIEF_MODE',
      spokenText: createBriefSpokenSummary(text),
      speechSyncAllowed: true,
      adminOnlyVoiceDelivery,
      adminVoiceDeliveryAllowed,
      privateAdminConversation,
      adminConversationAllowed,
      publicUsersMayAddressMarion: false,
      publicUsersSpeakThrough: 'Nyx'
    };
  }

  return {
    speakAllowed: true,
    voiceMode: 'full',
    reason: 'SPEAKABLE_RESPONSE',
    spokenText: text,
    speechSyncAllowed: true,
    adminOnlyVoiceDelivery,
    adminVoiceDeliveryAllowed,
    privateAdminConversation,
    adminConversationAllowed,
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: 'Nyx'
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
  isSafeProtectedVoiceStatusText,
  hasAdminVoiceDeliveryProof,
  hasPrivateAdminConversationProof
};

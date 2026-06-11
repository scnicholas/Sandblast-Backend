'use strict';

/**
 * MarionVoiceOutputPolicy
 * Determines whether Nyx should speak the final answer aloud.
 * Long code, sensitive details, and operational instructions default to text.
 */

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
    response.reply ||
    response.text ||
    response.message ||
    response.output ||
    response.final ||
    ''
  );
}

function containsPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(String(text || '')));
}

function evaluateVoiceOutputPolicy(response, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const text = getReplyText(response);
  const maxChars = Number.isFinite(Number(opts.maxSpokenChars))
    ? Number(opts.maxSpokenChars)
    : DEFAULT_MAX_SPOKEN_CHARS;

  if (opts.forceSilent === true) {
    return {
      speakAllowed: false,
      voiceMode: 'silent',
      reason: 'FORCED_SILENT'
    };
  }

  if (!text.trim()) {
    return {
      speakAllowed: false,
      voiceMode: 'silent',
      reason: 'EMPTY_RESPONSE'
    };
  }

  if (containsPattern(text, SENSITIVE_PATTERNS)) {
    return {
      speakAllowed: false,
      voiceMode: 'silent',
      reason: 'SENSITIVE_CONTENT'
    };
  }

  if (containsPattern(text, CODE_PATTERNS)) {
    return {
      speakAllowed: false,
      voiceMode: 'silent',
      reason: 'CODE_OR_MARKUP_CONTENT'
    };
  }

  if (text.length > maxChars) {
    return {
      speakAllowed: true,
      voiceMode: 'brief',
      reason: 'LONG_RESPONSE_BRIEF_MODE',
      spokenText: createBriefSpokenSummary(text)
    };
  }

  return {
    speakAllowed: true,
    voiceMode: 'full',
    reason: 'SPEAKABLE_RESPONSE',
    spokenText: text
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
  DEFAULT_MAX_SPOKEN_CHARS,
  evaluateVoiceOutputPolicy,
  applyVoiceOutputPolicy,
  createBriefSpokenSummary,
  getReplyText
};

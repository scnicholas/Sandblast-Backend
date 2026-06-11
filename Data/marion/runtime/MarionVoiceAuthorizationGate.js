'use strict';

/**
 * MarionVoiceAuthorizationGate
 * Keeps spoken input from becoming an unrestricted command lane.
 * Initial policy: Mac-authorized voice control is preferred.
 */

const RESTRICTED_INTENTS = new Set([
  'command'
]);

const RESTRICTED_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bpublish\b/i,
  /\bdeploy\b/i,
  /\bsend\b/i,
  /\bemail\b/i,
  /\btransfer\b/i,
  /\bpay\b/i,
  /\bshutdown\b/i,
  /\brestart\b/i,
  /\bexecute\b/i,
  /\brun\s+(script|command|test|deployment)\b/i
];

const DEFAULT_AUTHORIZED_SPEAKERS = [
  'mac',
  'sean',
  'sean nicholas'
];

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isRestrictedTranscript(transcript) {
  const text = String(transcript || '');
  return RESTRICTED_PATTERNS.some((pattern) => pattern.test(text));
}

function isSpeakerAuthorized(speakerHint, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const authorizedSpeakers = Array.isArray(opts.authorizedSpeakers)
    ? opts.authorizedSpeakers
    : DEFAULT_AUTHORIZED_SPEAKERS;

  const speaker = normalizeName(speakerHint);

  if (!speaker) return false;

  return authorizedSpeakers
    .map(normalizeName)
    .filter(Boolean)
    .some((authorized) => speaker === authorized || speaker.includes(authorized));
}

function evaluateVoiceAuthorization(envelope, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const allowConversationalWhenUnknown = opts.allowConversationalWhenUnknown !== false;

  const transcript = envelope && envelope.transcript ? envelope.transcript : '';
  const intent = envelope && envelope.userIntentHint ? envelope.userIntentHint : 'conversation';
  const speakerHint = envelope && envelope.speakerHint ? envelope.speakerHint : null;

  const restrictedByIntent = RESTRICTED_INTENTS.has(intent);
  const restrictedByPattern = isRestrictedTranscript(transcript);
  const restricted = restrictedByIntent || restrictedByPattern;
  const speakerAuthorized = isSpeakerAuthorized(speakerHint, opts);

  if (!transcript.trim()) {
    return {
      allowed: false,
      authorizationState: 'blocked',
      authority: 'MarionVoiceAuthorizationGate',
      reason: 'EMPTY_TRANSCRIPT',
      restricted,
      speakerAuthorized
    };
  }

  if (speakerAuthorized) {
    return {
      allowed: true,
      authorizationState: 'authorized',
      authority: 'MarionVoiceAuthorizationGate',
      reason: 'AUTHORIZED_SPEAKER',
      restricted,
      speakerAuthorized
    };
  }

  if (restricted) {
    return {
      allowed: false,
      authorizationState: 'blocked',
      authority: 'MarionVoiceAuthorizationGate',
      reason: 'RESTRICTED_VOICE_COMMAND_REQUIRES_AUTHORIZATION',
      restricted,
      speakerAuthorized
    };
  }

  if (allowConversationalWhenUnknown) {
    return {
      allowed: true,
      authorizationState: 'limited',
      authority: 'MarionVoiceAuthorizationGate',
      reason: 'LIMITED_CONVERSATIONAL_ACCESS',
      restricted,
      speakerAuthorized
    };
  }

  return {
    allowed: false,
    authorizationState: 'blocked',
    authority: 'MarionVoiceAuthorizationGate',
    reason: 'UNAUTHORIZED_SPEAKER',
    restricted,
    speakerAuthorized
  };
}

function applyVoiceAuthorization(envelope, options) {
  const auth = evaluateVoiceAuthorization(envelope, options);

  return {
    envelope: Object.assign({}, envelope, {
      authorizationState: auth.authorizationState,
      authorization: auth
    }),
    authorization: auth
  };
}

module.exports = {
  DEFAULT_AUTHORIZED_SPEAKERS,
  evaluateVoiceAuthorization,
  applyVoiceAuthorization,
  isRestrictedTranscript,
  isSpeakerAuthorized
};

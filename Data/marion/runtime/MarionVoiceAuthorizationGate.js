'use strict';

/**
 * MarionVoiceAuthorizationGate
 * Keeps spoken input from becoming an unrestricted command lane.
 *
 * Admin-only hardlock:
 * - Browser/client speaker hints are not trusted by default.
 * - "Mac", "Sean", or any other speaker label only helps when the caller
 *   has already been verified by a trusted server-side/admin path.
 * - Unknown public speakers are blocked from Marion voice delivery.
 */

const VERSION = 'marion.voiceAuthorizationGate/2.2-marion-admin-interface-hardlock';

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

const ADMIN_INTERFACE_SCOPES = new Set([
  'marion_admin_conversation',
  'marion_admin_voice',
  'lingosentinel_private_voice'
]);

const ADMIN_DELIVERY_CHANNELS = new Set([
  'marion_admin_interface',
  'marion_admin_voice',
  'lingosentinel_private_voice'
]);

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

function hasTrustedAdminVoiceProof(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const auth = env.authorization && typeof env.authorization === 'object' ? env.authorization : {};

  // SECURITY HARDLOCK:
  // - Options are server-side/contextual and may carry verified admin proof.
  // - Envelope flags are not trusted by default because they may originate from
  //   request bodies in weaker callers.
  // - Envelope proof is accepted only when the server explicitly marks that
  //   envelope as trusted.
  const optionProof =
    opts.adminVoiceVerified === true ||
    opts.adminVoiceTokenVerified === true ||
    opts.adminVoiceDeliveryAllowed === true ||
    opts.serverSideAdminVoiceAuth === true ||
    opts.trustedServerAuth === true;

  const envelopeProofTrusted =
    opts.trustEnvelopeAdminVoiceProof === true ||
    opts.allowEnvelopeAdminVoiceProof === true ||
    opts.serverSideAdminVoiceAuth === true ||
    opts.trustedServerAuth === true;

  const envelopeProof =
    env.adminVoiceVerified === true ||
    env.adminVoiceTokenVerified === true ||
    env.adminVoiceDeliveryAllowed === true ||
    auth.adminVoiceVerified === true ||
    auth.adminVoiceTokenVerified === true ||
    auth.adminVoiceDeliveryAllowed === true;

  return optionProof || (envelopeProofTrusted && envelopeProof);
}


function isTrustedAdminInterfaceScope(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const voice = env.voice && typeof env.voice === 'object' ? env.voice : {};
  const scope = normalizeName(opts.adminInterfaceScope || env.adminInterfaceScope || voice.adminInterfaceScope || '');
  const channel = normalizeName(opts.deliveryChannel || env.deliveryChannel || voice.deliveryChannel || '');
  const requested =
    opts.allowMarionAdminConversation === true ||
    opts.marionAdminConversation === true ||
    opts.directMarionAdminInterface === true ||
    env.directMarionAdminInterface === true ||
    env.marionAdminConversation === true ||
    voice.directMarionAdminInterface === true ||
    voice.marionAdminConversation === true ||
    ADMIN_INTERFACE_SCOPES.has(scope) ||
    ADMIN_DELIVERY_CHANNELS.has(channel);

  if (!requested) return false;
  if (!hasTrustedAdminVoiceProof(env, opts)) return false;

  return ADMIN_INTERFACE_SCOPES.has(scope) ||
    ADMIN_DELIVERY_CHANNELS.has(channel) ||
    opts.allowMarionAdminConversation === true ||
    opts.directMarionAdminInterface === true;
}

function resolveAdminInterfaceScope(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const voice = env.voice && typeof env.voice === 'object' ? env.voice : {};
  const scope = normalizeName(opts.adminInterfaceScope || env.adminInterfaceScope || voice.adminInterfaceScope || '');
  const channel = normalizeName(opts.deliveryChannel || env.deliveryChannel || voice.deliveryChannel || '');
  if (ADMIN_INTERFACE_SCOPES.has(scope)) return scope;
  if (ADMIN_DELIVERY_CHANNELS.has(channel)) return channel === 'marion_admin_interface' ? 'marion_admin_conversation' : channel;
  if (opts.allowMarionAdminConversation === true || opts.directMarionAdminInterface === true || env.directMarionAdminInterface === true) return 'marion_admin_conversation';
  return '';
}

function isSpeakerAuthorized(speakerHint, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const trustedHint = opts.trustSpeakerHint === true || opts.trustedSpeakerHint === true || opts.allowSpeakerHintAuthorization === true;

  if (!trustedHint) return false;

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
  const adminOnlyVoiceDelivery = opts.adminOnlyVoiceDelivery !== false && opts.adminOnly !== false;
  const allowConversationalWhenUnknown = opts.allowConversationalWhenUnknown === true;

  const transcript = envelope && envelope.transcript ? String(envelope.transcript) : '';
  const intent = envelope && envelope.userIntentHint ? envelope.userIntentHint : 'conversation';
  const speakerHint = envelope && envelope.speakerHint ? envelope.speakerHint : null;

  const restrictedByIntent = RESTRICTED_INTENTS.has(intent);
  const restrictedByPattern = isRestrictedTranscript(transcript);
  const restricted = restrictedByIntent || restrictedByPattern;
  const adminVoiceVerified = hasTrustedAdminVoiceProof(envelope, opts);
  const adminInterfaceScope = resolveAdminInterfaceScope(envelope, opts);
  const directMarionAdminInterface = isTrustedAdminInterfaceScope(envelope, opts);
  const speakerAuthorized = isSpeakerAuthorized(speakerHint, Object.assign({}, opts, {
    trustSpeakerHint: opts.trustSpeakerHint === true && adminVoiceVerified
  }));
  const adminAuthorized = adminVoiceVerified || speakerAuthorized;
  const marionAdminConversationAllowed = directMarionAdminInterface && adminAuthorized;

  if (!transcript.trim()) {
    return {
      allowed: false,
      authorizationState: 'blocked',
      authority: 'MarionVoiceAuthorizationGate',
      reason: 'EMPTY_TRANSCRIPT',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      adminInterfaceScope,
      marionAdminConversationAllowed: false,
      adminVoiceDeliveryAllowed: false
    };
  }

  if (adminAuthorized) {
    return {
      allowed: true,
      authorizationState: 'authorized',
      authority: 'MarionVoiceAuthorizationGate',
      reason: adminVoiceVerified ? 'ADMIN_VOICE_TOKEN_VERIFIED' : 'AUTHORIZED_TRUSTED_SPEAKER',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      adminInterfaceScope,
      marionAdminConversationAllowed,
      adminVoiceDeliveryAllowed: true
    };
  }

  if (adminOnlyVoiceDelivery) {
    return {
      allowed: false,
      authorizationState: 'blocked',
      authority: 'MarionVoiceAuthorizationGate',
      reason: restricted ? 'RESTRICTED_VOICE_COMMAND_REQUIRES_ADMIN_AUTHORIZATION' : 'ADMIN_ONLY_VOICE_DELIVERY_REQUIRED',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      adminInterfaceScope,
      marionAdminConversationAllowed: false,
      adminVoiceDeliveryAllowed: false
    };
  }

  if (restricted) {
    return {
      allowed: false,
      authorizationState: 'blocked',
      authority: 'MarionVoiceAuthorizationGate',
      reason: 'RESTRICTED_VOICE_COMMAND_REQUIRES_AUTHORIZATION',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      adminInterfaceScope,
      marionAdminConversationAllowed: false,
      adminVoiceDeliveryAllowed: false
    };
  }

  if (allowConversationalWhenUnknown) {
    return {
      allowed: true,
      authorizationState: 'limited',
      authority: 'MarionVoiceAuthorizationGate',
      reason: 'LIMITED_CONVERSATIONAL_ACCESS',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      adminInterfaceScope,
      marionAdminConversationAllowed: false,
      adminVoiceDeliveryAllowed: false
    };
  }

  return {
    allowed: false,
    authorizationState: 'blocked',
    authority: 'MarionVoiceAuthorizationGate',
    reason: 'UNAUTHORIZED_SPEAKER',
    restricted,
    speakerAuthorized,
    adminVoiceVerified,
    adminOnlyVoiceDelivery,
    adminVoiceDeliveryAllowed: false
  };
}

function applyVoiceAuthorization(envelope, options) {
  const auth = evaluateVoiceAuthorization(envelope, options);

  return {
    envelope: Object.assign({}, envelope, {
      authorizationState: auth.authorizationState,
      adminVoiceVerified: auth.adminVoiceVerified === true,
      adminOnlyVoiceDelivery: auth.adminOnlyVoiceDelivery !== false,
      directMarionAdminInterface: auth.directMarionAdminInterface === true,
      adminInterfaceScope: auth.adminInterfaceScope || '',
      marionAdminConversationAllowed: auth.marionAdminConversationAllowed === true,
      adminVoiceDeliveryAllowed: auth.adminVoiceDeliveryAllowed === true,
      authorization: auth
    }),
    authorization: auth
  };
}

module.exports = {
  VERSION,
  DEFAULT_AUTHORIZED_SPEAKERS,
  ADMIN_INTERFACE_SCOPES,
  ADMIN_DELIVERY_CHANNELS,
  evaluateVoiceAuthorization,
  applyVoiceAuthorization,
  isRestrictedTranscript,
  isSpeakerAuthorized,
  hasTrustedAdminVoiceProof,
  isTrustedAdminInterfaceScope,
  resolveAdminInterfaceScope
};

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

const VERSION = 'marion.voiceAuthorizationGate/2.6-phase6-challenge-verification';

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


const REMOTE_TRUSTED_USER_SCOPES = new Set([
  'remote_trusted_user',
  'trusted_remote_user',
  'lingosentinel_remote_trusted_user',
  'marion_remote_trusted_user'
]);

const REMOTE_TRUSTED_DELIVERY_CHANNELS = new Set([
  'remote_trusted_voice',
  'lingosentinel_remote_trusted_voice',
  'marion_remote_trusted_voice'
]);

const REMOTE_TRUSTED_USER_CAPABILITIES = Object.freeze([
  'status.read',
  'voice.private.submit',
  'voice.private.receive',
  'session.check'
]);

const speakerIdentityMod = (() => {
  try {
    return require('./MarionVoiceSpeakerIdentity');
  } catch (_) {
    return null;
  }
})();

function resolveSpeakerIdentity(envelope, options) {
  if (speakerIdentityMod && typeof speakerIdentityMod.resolveVoiceSpeakerIdentity === 'function') {
    return speakerIdentityMod.resolveVoiceSpeakerIdentity(envelope, options);
  }
  return {
    version: 'marion.voiceSpeakerIdentity/fallback',
    voiceIdentityBoundary: true,
    identityIsAuthority: false,
    authorityStillRequiresRBAC: true,
    roleBinding: 'blocked',
    voiceMatchStatus: 'unknown',
    speakerRegistryAvailable: false,
    speakerRegistryMatched: false,
    speakerRegistryStatus: 'unknown',
    speakerRegistryBlocked: false,
    profileMetadataOnly: true,
    voiceprintStored: false,
    speakerConfidence: null,
    speakerHintTrusted: false,
    rawAudioStored: false,
    audioStored: false,
    transcriptOnly: true
  };
}


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


function hasTrustedRemoteUserVoiceProof(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const auth = env.authorization && typeof env.authorization === 'object' ? env.authorization : {};

  const optionProof =
    opts.remoteTrustedUserVerified === true ||
    opts.remoteTrustedUserTokenVerified === true ||
    opts.trustedRemoteUserAuth === true ||
    opts.serverSideRemoteTrustedUserAuth === true ||
    opts.trustedServerAuth === true ||
    opts.role === 'remote_trusted_user';

  const envelopeProofTrusted =
    opts.trustEnvelopeRemoteTrustedUserProof === true ||
    opts.allowEnvelopeRemoteTrustedUserProof === true ||
    opts.serverSideRemoteTrustedUserAuth === true ||
    opts.trustedServerAuth === true;

  const envelopeProof =
    env.remoteTrustedUserVerified === true ||
    env.remoteTrustedUserTokenVerified === true ||
    env.trustedRemoteUserAuth === true ||
    auth.remoteTrustedUserVerified === true ||
    auth.remoteTrustedUserTokenVerified === true ||
    auth.role === 'remote_trusted_user';

  return optionProof || (envelopeProofTrusted && envelopeProof);
}

function isTrustedRemoteUserScope(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const voice = env.voice && typeof env.voice === 'object' ? env.voice : {};
  const scope = normalizeName(opts.remoteTrustedUserScope || opts.adminInterfaceScope || env.remoteTrustedUserScope || env.adminInterfaceScope || voice.remoteTrustedUserScope || voice.adminInterfaceScope || '');
  const channel = normalizeName(opts.deliveryChannel || env.deliveryChannel || voice.deliveryChannel || '');
  const requested =
    opts.allowRemoteTrustedUser === true ||
    opts.remoteTrustedUser === true ||
    opts.trustedRemoteUser === true ||
    env.remoteTrustedUser === true ||
    env.trustedRemoteUser === true ||
    voice.remoteTrustedUser === true ||
    REMOTE_TRUSTED_USER_SCOPES.has(scope) ||
    REMOTE_TRUSTED_DELIVERY_CHANNELS.has(channel);

  if (!requested) return false;
  if (!hasTrustedRemoteUserVoiceProof(env, opts)) return false;

  return REMOTE_TRUSTED_USER_SCOPES.has(scope) ||
    REMOTE_TRUSTED_DELIVERY_CHANNELS.has(channel) ||
    opts.allowRemoteTrustedUser === true ||
    opts.remoteTrustedUser === true ||
    opts.trustedRemoteUser === true;
}

function resolveRemoteTrustedUserScope(envelope, options) {
  const env = envelope && typeof envelope === 'object' ? envelope : {};
  const opts = options && typeof options === 'object' ? options : {};
  const voice = env.voice && typeof env.voice === 'object' ? env.voice : {};
  const scope = normalizeName(opts.remoteTrustedUserScope || env.remoteTrustedUserScope || voice.remoteTrustedUserScope || opts.adminInterfaceScope || env.adminInterfaceScope || voice.adminInterfaceScope || '');
  const channel = normalizeName(opts.deliveryChannel || env.deliveryChannel || voice.deliveryChannel || '');
  if (REMOTE_TRUSTED_USER_SCOPES.has(scope)) return scope;
  if (REMOTE_TRUSTED_DELIVERY_CHANNELS.has(channel)) return 'remote_trusted_user';
  if (opts.allowRemoteTrustedUser === true || opts.remoteTrustedUser === true || env.remoteTrustedUser === true) return 'remote_trusted_user';
  return '';
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
  const speakerIdentity = resolveSpeakerIdentity(envelope, opts);

  const restrictedByIntent = RESTRICTED_INTENTS.has(intent);
  const restrictedByPattern = isRestrictedTranscript(transcript);
  const restricted = restrictedByIntent || restrictedByPattern;
  const adminVoiceVerified = hasTrustedAdminVoiceProof(envelope, opts);
  const remoteTrustedUserVerified = hasTrustedRemoteUserVoiceProof(envelope, opts);
  const adminInterfaceScope = resolveAdminInterfaceScope(envelope, opts);
  const remoteTrustedUserScope = resolveRemoteTrustedUserScope(envelope, opts);
  const directMarionAdminInterface = isTrustedAdminInterfaceScope(envelope, opts);
  const directRemoteTrustedUserInterface = isTrustedRemoteUserScope(envelope, opts);
  const speakerAuthorized = isSpeakerAuthorized(speakerHint, Object.assign({}, opts, {
    trustSpeakerHint: opts.trustSpeakerHint === true && adminVoiceVerified
  }));
  const adminAuthorized = adminVoiceVerified || speakerAuthorized;
  const remoteTrustedUserAuthorized = remoteTrustedUserVerified && directRemoteTrustedUserInterface;
  const marionAdminConversationAllowed = directMarionAdminInterface && adminAuthorized;

  if (!transcript.trim()) {
    return {
      allowed: false,
      authorizationState: 'blocked',
      authority: 'MarionVoiceAuthorizationGate',
      speakerIdentity,
      voiceIdentityBoundary: true,
      identityIsAuthority: false,
      authorityStillRequiresRBAC: true,
      reason: 'EMPTY_TRANSCRIPT',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      adminInterfaceScope,
      remoteTrustedUserVerified,
      directRemoteTrustedUserInterface,
      remoteTrustedUserScope,
      remoteTrustedUserAuthorized: false,
      remoteTrustedVoiceDeliveryAllowed: false,
      remoteTrustedUserCapabilities: [],
      marionAdminConversationAllowed: false,
      adminVoiceDeliveryAllowed: false
    };
  }

  if (adminAuthorized) {
    return {
      allowed: true,
      authorizationState: 'authorized',
      authority: 'MarionVoiceAuthorizationGate',
      speakerIdentity,
      voiceIdentityBoundary: true,
      identityIsAuthority: false,
      authorityStillRequiresRBAC: true,
      reason: adminVoiceVerified ? 'ADMIN_VOICE_TOKEN_VERIFIED' : 'AUTHORIZED_TRUSTED_SPEAKER',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      adminInterfaceScope,
      remoteTrustedUserVerified,
      directRemoteTrustedUserInterface,
      remoteTrustedUserScope,
      remoteTrustedUserAuthorized: false,
      remoteTrustedVoiceDeliveryAllowed: false,
      remoteTrustedUserCapabilities: [],
      marionAdminConversationAllowed,
      adminVoiceDeliveryAllowed: true
    };
  }

  if (remoteTrustedUserAuthorized) {
    if (restricted) {
      return {
        allowed: false,
        authorizationState: 'blocked',
        authority: 'MarionVoiceAuthorizationGate',
      speakerIdentity,
      voiceIdentityBoundary: true,
      identityIsAuthority: false,
      authorityStillRequiresRBAC: true,
        reason: 'REMOTE_TRUSTED_USER_RESTRICTED_COMMAND_BLOCKED',
        restricted,
        speakerAuthorized,
        adminVoiceVerified,
        remoteTrustedUserVerified,
        adminOnlyVoiceDelivery,
        directMarionAdminInterface,
        directRemoteTrustedUserInterface,
        adminInterfaceScope,
        remoteTrustedUserScope,
        remoteTrustedUserAuthorized: true,
        remoteTrustedVoiceDeliveryAllowed: false,
        remoteTrustedUserCapabilities: REMOTE_TRUSTED_USER_CAPABILITIES,
        marionAdminConversationAllowed: false,
        adminVoiceDeliveryAllowed: false
      };
    }

    return {
      allowed: true,
      authorizationState: 'limited',
      authority: 'MarionVoiceAuthorizationGate',
      speakerIdentity,
      voiceIdentityBoundary: true,
      identityIsAuthority: false,
      authorityStillRequiresRBAC: true,
      reason: 'REMOTE_TRUSTED_USER_VERIFIED',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      remoteTrustedUserVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      directRemoteTrustedUserInterface,
      adminInterfaceScope,
      remoteTrustedUserScope,
      remoteTrustedUserAuthorized: true,
      remoteTrustedVoiceDeliveryAllowed: true,
      remoteTrustedUserCapabilities: REMOTE_TRUSTED_USER_CAPABILITIES,
      marionAdminConversationAllowed: false,
      adminVoiceDeliveryAllowed: false
    };
  }

  if (adminOnlyVoiceDelivery) {
    return {
      allowed: false,
      authorizationState: 'blocked',
      authority: 'MarionVoiceAuthorizationGate',
      speakerIdentity,
      voiceIdentityBoundary: true,
      identityIsAuthority: false,
      authorityStillRequiresRBAC: true,
      reason: restricted ? 'RESTRICTED_VOICE_COMMAND_REQUIRES_ADMIN_AUTHORIZATION' : 'ADMIN_ONLY_VOICE_DELIVERY_REQUIRED',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      adminInterfaceScope,
      remoteTrustedUserVerified,
      directRemoteTrustedUserInterface,
      remoteTrustedUserScope,
      remoteTrustedUserAuthorized: false,
      remoteTrustedVoiceDeliveryAllowed: false,
      remoteTrustedUserCapabilities: [],
      marionAdminConversationAllowed: false,
      adminVoiceDeliveryAllowed: false
    };
  }

  if (restricted) {
    return {
      allowed: false,
      authorizationState: 'blocked',
      authority: 'MarionVoiceAuthorizationGate',
      speakerIdentity,
      voiceIdentityBoundary: true,
      identityIsAuthority: false,
      authorityStillRequiresRBAC: true,
      reason: 'RESTRICTED_VOICE_COMMAND_REQUIRES_AUTHORIZATION',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      adminInterfaceScope,
      remoteTrustedUserVerified,
      directRemoteTrustedUserInterface,
      remoteTrustedUserScope,
      remoteTrustedUserAuthorized: false,
      remoteTrustedVoiceDeliveryAllowed: false,
      remoteTrustedUserCapabilities: [],
      marionAdminConversationAllowed: false,
      adminVoiceDeliveryAllowed: false
    };
  }

  if (allowConversationalWhenUnknown) {
    return {
      allowed: true,
      authorizationState: 'limited',
      authority: 'MarionVoiceAuthorizationGate',
      speakerIdentity,
      voiceIdentityBoundary: true,
      identityIsAuthority: false,
      authorityStillRequiresRBAC: true,
      reason: 'LIMITED_CONVERSATIONAL_ACCESS',
      restricted,
      speakerAuthorized,
      adminVoiceVerified,
      remoteTrustedUserVerified,
      adminOnlyVoiceDelivery,
      directMarionAdminInterface,
      directRemoteTrustedUserInterface,
      adminInterfaceScope,
      remoteTrustedUserScope,
      remoteTrustedUserAuthorized: false,
      remoteTrustedVoiceDeliveryAllowed: false,
      remoteTrustedUserCapabilities: [],
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
  const identityEnvelope = speakerIdentityMod && typeof speakerIdentityMod.applyVoiceSpeakerIdentityEnvelope === 'function'
    ? speakerIdentityMod.applyVoiceSpeakerIdentityEnvelope(envelope, Object.assign({}, options || {}, auth))
    : Object.assign({}, envelope, { speakerIdentity: auth.speakerIdentity });

  return {
    envelope: Object.assign({}, identityEnvelope, {
      authorizationState: auth.authorizationState,
      adminVoiceVerified: auth.adminVoiceVerified === true,
      adminOnlyVoiceDelivery: auth.adminOnlyVoiceDelivery !== false,
      directMarionAdminInterface: auth.directMarionAdminInterface === true,
      directRemoteTrustedUserInterface: auth.directRemoteTrustedUserInterface === true,
      adminInterfaceScope: auth.adminInterfaceScope || '',
      remoteTrustedUserScope: auth.remoteTrustedUserScope || '',
      remoteTrustedUserVerified: auth.remoteTrustedUserVerified === true,
      remoteTrustedUserAuthorized: auth.remoteTrustedUserAuthorized === true,
      remoteTrustedVoiceDeliveryAllowed: auth.remoteTrustedVoiceDeliveryAllowed === true,
      remoteTrustedUserCapabilities: auth.remoteTrustedUserCapabilities || [],
      marionAdminConversationAllowed: auth.marionAdminConversationAllowed === true,
      adminVoiceDeliveryAllowed: auth.adminVoiceDeliveryAllowed === true,
      speakerIdentity: auth.speakerIdentity,
      voiceIdentity: auth.speakerIdentity,
      voiceIdentityBoundary: true,
      identityIsAuthority: false,
      liveChallengeRequired: auth.speakerIdentity && auth.speakerIdentity.liveChallengeRequired === true,
      liveChallengeVerified: auth.speakerIdentity && auth.speakerIdentity.liveChallengeVerified === true,
      challengeStatus: auth.speakerIdentity && auth.speakerIdentity.challengeStatus || 'unknown',
      challengeBlocked: auth.speakerIdentity && auth.speakerIdentity.challengeBlocked === true,
      challengePreventsReplay: true,
      challengeIsAuthority: false,
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
  REMOTE_TRUSTED_USER_SCOPES,
  REMOTE_TRUSTED_DELIVERY_CHANNELS,
  REMOTE_TRUSTED_USER_CAPABILITIES,
  evaluateVoiceAuthorization,
  applyVoiceAuthorization,
  isRestrictedTranscript,
  isSpeakerAuthorized,
  hasTrustedAdminVoiceProof,
  hasTrustedRemoteUserVoiceProof,
  isTrustedAdminInterfaceScope,
  isTrustedRemoteUserScope,
  resolveAdminInterfaceScope,
  resolveRemoteTrustedUserScope,
  resolveSpeakerIdentity
};


/* PHASE3D_VOICE_AUTHORIZATION_PARITY_HARDLOCK_START */
(function(){try{
  const V="nyx.marion.phase3d.voiceAuthorizationParityWrapper/1.0";let lock=null;try{lock=require("./voiceTextParityIdentityDriftHardlock.js");}catch(_){lock=null;}
  if(!lock||!lock.projectAuthorizationResult||typeof module==="undefined"||!module.exports)return;
  function wrap(fn,name){if(typeof fn!=="function"||fn.__phase3dVoiceAuthParity)return fn;const w=function(){const args=arguments;const r=fn.apply(this,args);const project=v=>lock.projectAuthorizationResult(v,{body:args[0],options:args[1],inputChannel:"voice",voice:true});return r&&typeof r.then==="function"?r.then(project):project(r);};w.__phase3dVoiceAuthParity=true;return w;}
  module.exports.evaluateVoiceAuthorization=wrap(module.exports.evaluateVoiceAuthorization,"evaluateVoiceAuthorization");
  module.exports.applyVoiceAuthorization=wrap(module.exports.applyVoiceAuthorization,"applyVoiceAuthorization");
  module.exports.PHASE3D_VOICE_AUTHORIZATION_PARITY_HARDLOCK_VERSION=V;
}catch(_){}})();
/* PHASE3D_VOICE_AUTHORIZATION_PARITY_HARDLOCK_END */

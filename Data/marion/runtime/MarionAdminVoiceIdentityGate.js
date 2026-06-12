"use strict";

const crypto = require("crypto");
const { cleanText } = require("./MarionVoiceIntentClasses.js");

const VERSION = "marion.adminVoiceIdentityGate/1.0-adminOnlyDelivery";

function envList(name, fallback) {
  const raw = cleanText(process.env[name] || "");
  const src = raw ? raw.split(",") : fallback;
  return src.map((v) => cleanText(v).toLowerCase()).filter(Boolean);
}

function normalizeSpeaker(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (!aa.length || !bb.length || aa.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(aa, bb); } catch (_) { return false; }
}

function headerValue(headers, key) {
  const h = headers && typeof headers === "object" ? headers : {};
  return h[key] || h[key.toLowerCase()] || h[key.toUpperCase()] || "";
}

function evaluateAdminVoiceIdentity(input = {}, options = {}) {
  const adminSpeakers = Array.isArray(options.adminSpeakers) && options.adminSpeakers.length
    ? options.adminSpeakers.map(normalizeSpeaker).filter(Boolean)
    : envList("SB_MARION_ADMIN_SPEAKERS", ["mac", "sean", "sean nicholas", "sandblast admin"]);

  const speakerCandidates = [
    input.speakerHint,
    input.speaker,
    input.user,
    input.adminName,
    input.profileName,
    options.speakerHint
  ].map(normalizeSpeaker).filter(Boolean);

  const speakerAccepted = speakerCandidates.some((speaker) => adminSpeakers.includes(speaker));
  const requiredToken = cleanText(options.requiredAdminToken || process.env.SB_MARION_ADMIN_VOICE_TOKEN || "");
  const providedToken = cleanText(
    input.adminToken ||
    input.token ||
    headerValue(input.headers, "x-sb-marion-admin-token") ||
    headerValue(input.headers, "x-sb-admin-voice-token") ||
    ""
  );
  const requireToken = options.requireAdminToken === true || /^(?:1|true|yes|on)$/i.test(cleanText(process.env.SB_MARION_ADMIN_VOICE_REQUIRE_TOKEN || ""));
  const tokenConfigured = !!requiredToken;
  const tokenAccepted = tokenConfigured ? safeEqual(providedToken, requiredToken) : false;
  const authorized = speakerAccepted && (!requireToken || tokenAccepted);

  return {
    ok: true,
    version: VERSION,
    authorized,
    adminVoiceAllowed: authorized,
    speakerAccepted,
    tokenConfigured,
    tokenRequired: requireToken,
    tokenAccepted,
    reason: authorized
      ? "ADMIN_VOICE_IDENTITY_ACCEPTED"
      : !speakerAccepted
        ? "ADMIN_SPEAKER_NOT_ACCEPTED"
        : "ADMIN_TOKEN_REQUIRED_OR_INVALID",
    identityMode: requireToken ? "speaker_plus_token" : "speaker_hint_development_lock",
    audioStored: false,
    noRawAudioStored: true
  };
}

module.exports = {
  VERSION,
  evaluateAdminVoiceIdentity,
  normalizeSpeaker
};

"use strict";

const assert = require("assert");

const chatEngine = require("../../Utils/chatEngine.js");
const stateSpine = require("../../Utils/stateSpine.js");
const outputPolicy = require("../../Data/marion/runtime/MarionVoiceOutputPolicy.js");
const telemetry = require("../../Data/marion/runtime/MarionVoiceTelemetry.js");
const normalizer = require("../../Data/marion/runtime/MarionVoiceTranscriptNormalizer.js");

function main() {
  const adminCarry = chatEngine.extractMarionAdminConversationCarry({
    marionAdminConversation: {
      privateAdminConversation: true,
      adminConversationAllowed: true
    }
  });
  assert.strictEqual(adminCarry.privateAdminConversation, true);
  assert.strictEqual(adminCarry.publicUsersMayAddressMarion, false);
  assert.strictEqual(adminCarry.publicUsersSpeakThrough, "Nyx");
  assert.strictEqual(adminCarry.noRawAudioStored, true);

  const silentCarry = chatEngine.extractLingoSentinelSilentOversightCarry({
    lingoSentinel: {
      silentOversight: true,
      userToUserBoundary: true,
      languages: ["en", "fr", "es"]
    }
  });
  assert.strictEqual(silentCarry.silentOversight, true);
  assert.strictEqual(silentCarry.marionVisibleParticipant, false);
  assert.deepStrictEqual(silentCarry.languages, ["en", "fr", "es"]);

  const stateAdmin = stateSpine.extractMarionAdminConversationCarry({
    privateAdminConversation: true,
    adminConversationAllowed: true
  });
  assert.strictEqual(stateAdmin.privateAdminConversation, true);
  assert.strictEqual(stateAdmin.tokenExposed, false);

  const stateSilent = stateSpine.extractLingoSentinelSilentOversightCarry({
    lingoSentinelSilentOversight: {
      silentOversight: true,
      languages: ["english", "french", "spanish"]
    }
  });
  assert.strictEqual(stateSilent.silentOversight, true);
  assert.strictEqual(stateSilent.visibleToUsers, false);

  const normalized = normalizer.normalizeVoiceTranscript("Marion, I like English, French, and Spanish continuity for Lingo Sentinel.");
  assert.strictEqual(normalized.wakeWord, "marion");
  assert.ok(/\blike\b/i.test(normalized.normalizedTranscript), "semantic word 'like' must not be stripped as filler");
  assert.strictEqual(normalized.lingoSentinelContinuityRequested, true);
  assert.ok(normalized.targetLanguages.includes("en"));
  assert.ok(normalized.targetLanguages.includes("fr"));
  assert.ok(normalized.targetLanguages.includes("es"));

  const policy = outputPolicy.evaluateVoiceOutputPolicy({
    reply: "Marion admin conversation route is active. Public users still speak through Nyx, and raw audio is not being stored."
  }, {
    privateAdminConversation: true,
    adminConversationAllowed: true
  });
  assert.strictEqual(policy.speakAllowed, true);
  assert.strictEqual(policy.privateAdminConversation, true);
  assert.strictEqual(policy.publicUsersMayAddressMarion, false);

  const codePolicy = outputPolicy.evaluateVoiceOutputPolicy({
    reply: "const value = 1;"
  }, {
    privateAdminConversation: true,
    adminConversationAllowed: true
  });
  assert.strictEqual(codePolicy.speakAllowed, false);
  assert.strictEqual(codePolicy.reason, "ADMIN_CONVERSATION_CODE_SCREEN_ONLY");
  assert.strictEqual(codePolicy.textFallbackAvailable, true);

  const evt = telemetry.createMarionAdminConversationTelemetryEvent({
    sessionId: "s1",
    privateAdminConversation: true,
    adminConversationAllowed: true,
    transcript: "This should only count by length.",
    adminVoiceToken: "should-not-leak"
  }, {
    token: "should-not-leak",
    nested: {
      token: "should-not-leak",
      safe: "visible"
    },
    audioStored: false
  });
  assert.strictEqual(evt.privateAdminConversation, true);
  assert.strictEqual(evt.audioStored, false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(evt.detail, "token"), false);
  assert.strictEqual(evt.detail.nested.safe, "visible");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(evt.detail.nested, "token"), false);

  const summary = telemetry.createVoiceTelemetrySummary([
    evt,
    telemetry.createLingoSentinelSilentOversightTelemetryEvent({ userToUserBoundary: true }, {})
  ]);
  assert.strictEqual(summary.privateAdminConversationObserved, true);
  assert.strictEqual(summary.lingoSentinelSilentOversightObserved, true);

  console.log("PASS marion-admin-lingosentinel-phase1c-runtime-carry");
}

main();

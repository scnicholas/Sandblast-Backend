"use strict";

const assert = require("assert");
const challenge = require("../../Data/marion/runtime/MarionVoiceChallengeVerifier");
const continuity = require("../../Data/marion/runtime/MarionVoiceContinuityWindow");

function ownerContext() {
  return {
    sessionVerified: true,
    sessionId: "phase7-session-001",
    role: "owner",
    adminVerified: true,
    ownerVerified: true,
    trustedServerAuth: true
  };
}

(function run() {
  if (challenge.clearChallengesForTests) challenge.clearChallengesForTests();
  if (continuity.clearContinuityWindowsForTests) continuity.clearContinuityWindowsForTests();

  const h = continuity.health();
  assert.strictEqual(h.ok, true);
  assert.strictEqual(h.challengeRequiredToOpen, true);
  assert.strictEqual(h.rawAudioStored, false);
  assert.strictEqual(h.voiceprintStored, false);
  assert.strictEqual(h.continuityIsAuthority, false);

  const ctx = ownerContext();
  const denied = continuity.openContinuityWindow({ speakerId: "mac-owner", sessionId: ctx.sessionId }, ctx);
  assert.strictEqual(denied.ok, false);
  assert.ok(denied.statusCode >= 400);

  const issued = challenge.issueChallenge({ speakerId: "mac-owner", roleBinding: "owner", sessionId: ctx.sessionId }, ctx);
  assert.strictEqual(issued.ok, true);
  assert.strictEqual(issued.challengeIssued, true);
  assert.ok(issued.challenge && issued.challenge.challengeId);
  assert.ok(issued.challenge && issued.challenge.phrase);

  const opened = continuity.openContinuityWindow({
    challengeId: issued.challenge.challengeId,
    responsePhrase: issued.challenge.phrase,
    speakerId: "mac-owner",
    roleBinding: "owner",
    sessionId: ctx.sessionId
  }, ctx);
  assert.strictEqual(opened.ok, true);
  assert.strictEqual(opened.trustedVoiceWindowActive, true);
  assert.strictEqual(opened.continuityWindowVerified, true);
  assert.strictEqual(opened.continuityIsAuthority, false);
  assert.ok(opened.windowId);
  assert.ok(opened.continuityToken);

  const checked = continuity.checkContinuityWindow({
    windowId: opened.windowId,
    continuityToken: opened.continuityToken,
    speakerId: "mac-owner",
    sessionId: ctx.sessionId
  }, ctx);
  assert.strictEqual(checked.ok, true);
  assert.strictEqual(checked.trustedVoiceWindowActive, true);

  const drifted = continuity.checkContinuityWindow({
    windowId: opened.windowId,
    continuityToken: opened.continuityToken,
    speakerId: "mac-owner",
    sessionId: "wrong-session"
  }, ctx);
  assert.strictEqual(drifted.ok, false);
  assert.strictEqual(drifted.stage, "voice_continuity_session_mismatch");

  const revoked = continuity.revokeContinuityWindow({ windowId: opened.windowId }, ctx);
  assert.strictEqual(revoked.ok, true);
  assert.strictEqual(revoked.trustedVoiceWindowActive, false);

  const dead = continuity.checkContinuityWindow({
    windowId: opened.windowId,
    continuityToken: opened.continuityToken,
    speakerId: "mac-owner",
    sessionId: ctx.sessionId
  }, ctx);
  assert.strictEqual(dead.ok, false);

  console.log("PHASE 7 VOICE CONTINUITY CONTRACT: PASSED");
})();

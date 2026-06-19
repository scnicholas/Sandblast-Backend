"use strict";

const assert = require("assert");
const registry = require("../../Data/marion/runtime/MarionVoiceSpeakerRegistry.js");
const challenge = require("../../Data/marion/runtime/MarionVoiceChallengeVerifier.js");
const identity = require("../../Data/marion/runtime/MarionVoiceSpeakerIdentity.js");

registry.clearRegistryForTests();
challenge.clearChallengesForTests();

const ownerContext = { role: "owner", adminVerified: true, ownerVerified: true, sessionVerified: true, sessionId: "owner-session-phase6" };
const ownerNoSession = { role: "owner", adminVerified: true, ownerVerified: true, sessionVerified: false };
const remoteContext = { role: "remote_trusted_user", remoteTrustedUserVerified: true, sessionVerified: true, sessionId: "remote-session-phase6" };

const requested = registry.requestEnrollment({ speakerId: "phase6-owner", displayName: "Phase 6 Owner", roleBinding: "owner" }, ownerContext);
assert.strictEqual(requested.ok, true, "owner should request phase6 speaker enrollment");
const approved = registry.approveEnrollment({ requestId: requested.request.requestId, roleBinding: "owner" }, ownerContext);
assert.strictEqual(approved.ok, true, "owner should approve phase6 speaker enrollment");
assert.strictEqual(approved.speaker.liveChallengeRequired, true, "approved speaker profile should require live challenge");
assert.strictEqual(approved.speaker.challengeIsAuthority, false, "challenge cannot become authority on a profile");

const noChallengeIdentity = identity.resolveVoiceSpeakerIdentity({ detectedSpeakerId: "phase6-owner", speakerConfidence: 0.96, voiceMatchStatus: "strong_match" }, {});
assert.strictEqual(noChallengeIdentity.speakerRegistryMatched, true, "registered speaker should match registry evidence");
assert.strictEqual(noChallengeIdentity.liveChallengeRequired, true, "registered speaker should require live challenge without trusted session proof");
assert.strictEqual(noChallengeIdentity.liveChallengeVerified, false, "registered speaker without challenge must not be live verified");
assert.strictEqual(noChallengeIdentity.roleBinding, "blocked", "registered speaker without challenge/auth must be blocked evidence");

const remoteIssue = challenge.issueChallenge({ speakerId: "phase6-owner" }, remoteContext);
assert.strictEqual(remoteIssue.ok, false, "remote trusted user must not issue owner speaker challenges");
assert.strictEqual(remoteIssue.statusCode, 403, "remote challenge issue denial must be 403");

const noSessionIssue = challenge.issueChallenge({ speakerId: "phase6-owner" }, ownerNoSession);
assert.strictEqual(noSessionIssue.ok, false, "owner without short-lived session must not issue challenge");
assert.strictEqual(noSessionIssue.statusCode, 403, "owner no-session issue denial must be 403");

const issued = challenge.issueChallenge({ speakerId: "phase6-owner" }, ownerContext);
assert.strictEqual(issued.ok, true, "owner session should issue live challenge");
assert.strictEqual(issued.challenge.rawAudioStored, false, "challenge must not store raw audio");
assert.strictEqual(issued.challenge.voiceprintStored, false, "challenge must not store voiceprints");
assert.strictEqual(issued.challenge.challengeIsAuthority, false, "challenge success must never be authority");

const wrong = challenge.checkChallenge({ speakerId: "phase6-owner", challengeId: issued.challenge.challengeId, responseTranscript: "wrong response" }, ownerContext);
assert.strictEqual(wrong.ok, false, "wrong challenge response must fail");
assert.strictEqual(wrong.liveChallengeVerified, false, "wrong challenge response must not verify liveness");

const verified = challenge.checkChallenge({ speakerId: "phase6-owner", challengeId: issued.challenge.challengeId, responseTranscript: issued.expectedResponse }, ownerContext);
assert.strictEqual(verified.ok, true, "correct challenge response should verify liveness");
assert.strictEqual(verified.liveChallengeVerified, true, "correct challenge response should be live verified");
assert.strictEqual(verified.challengeIsAuthority, false, "verified challenge still must not be authority");
assert.strictEqual(verified.authorityStillRequiresRBAC, true, "verified challenge must remain RBAC-bound");

const replay = challenge.checkChallenge({ speakerId: "phase6-owner", challengeId: issued.challenge.challengeId, responseTranscript: issued.expectedResponse }, ownerContext);
assert.strictEqual(replay.ok, false, "replayed challenge must be blocked");
assert.strictEqual(replay.liveChallengeVerified, false, "replayed challenge must not verify liveness");
assert.ok([409, 404].includes(replay.statusCode), "replay should return conflict or not found after single-use cleanup");

const untrustedClaim = challenge.evaluateChallengeEvidence({ liveChallengeVerified: true }, {});
assert.strictEqual(untrustedClaim.liveChallengeVerified, false, "client-claimed challenge verification without trusted session must be ignored");
assert.strictEqual(untrustedClaim.challengeIsAuthority, false, "challenge evidence cannot become authority");

console.log("PHASE 6 voice challenge contract passed");

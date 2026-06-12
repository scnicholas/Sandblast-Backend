"use strict";

const assert = require("assert");
const { evaluateAdminVoiceIdentity } = require("../../Data/marion/runtime/MarionAdminVoiceIdentityGate.js");

let gate = evaluateAdminVoiceIdentity({ speakerHint: "Mac" });
assert.strictEqual(gate.authorized, true);
assert.strictEqual(gate.adminVoiceAllowed, true);
assert.strictEqual(gate.audioStored, false);

 gate = evaluateAdminVoiceIdentity({ speakerHint: "Guest" });
assert.strictEqual(gate.authorized, false);
assert.strictEqual(gate.reason, "ADMIN_SPEAKER_NOT_ACCEPTED");

gate = evaluateAdminVoiceIdentity(
  { speakerHint: "Mac", adminToken: "abc123" },
  { requireAdminToken: true, requiredAdminToken: "abc123" }
);
assert.strictEqual(gate.authorized, true);
assert.strictEqual(gate.tokenAccepted, true);

gate = evaluateAdminVoiceIdentity(
  { speakerHint: "Mac", adminToken: "wrong" },
  { requireAdminToken: true, requiredAdminToken: "abc123" }
);
assert.strictEqual(gate.authorized, false);
assert.strictEqual(gate.reason, "ADMIN_TOKEN_REQUIRED_OR_INVALID");

console.log("PASS marion-admin-voice-identity-gate");

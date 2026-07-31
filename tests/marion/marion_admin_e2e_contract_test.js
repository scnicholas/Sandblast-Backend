"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const indexPath = path.join(root, "index.js");
const bridgePath = path.join(root, "Data", "marion", "runtime", "marionBridge.js");
const indexSource = fs.readFileSync(indexPath, "utf8");

assert(indexSource.includes('"/api/marion/admin/conversation"'), "canonical admin conversation route missing");
assert(indexSource.includes('"/api/private/marion/admin/conversation"'), "private admin conversation alias missing");
assert(indexSource.includes('"/api/marion/admin/conversation/health"'), "canonical admin health route missing");
assert(indexSource.includes('"/api/private/marion/admin/conversation/health"'), "private admin health alias missing");
assert(indexSource.includes('"/api/marion/admin/runtime"'), "admin runtime compatibility alias missing");
assert(indexSource.includes('voiceCredentialsAcceptedForText: false'), "text/voice credential separation missing");

const envBlock = indexSource.slice(indexSource.indexOf("function marionAdminConversationEnvTokens"), indexSource.indexOf("function marionAdminConversationRequestAuth"));
assert(!/VOICE_TOKEN/.test(envBlock), "voice environment tokens must not authorize text administration");
const authStart = indexSource.indexOf("function marionAdminConversationRequestAuth");
const authEnd = indexSource.indexOf("function marionAdminConversationRuntimeDiagnostics", authStart);
const authBlock = indexSource.slice(authStart, authEnd);
assert(!/admin-voice-token/.test(authBlock), "voice headers must not authorize text administration");
assert(authBlock.includes('configured: true'), "verified session must report authentication configured");

const bridge = require(bridgePath);
assert.strictEqual(typeof bridge.handleMarionAdminConversation, "function", "private admin bridge handler missing");
assert.strictEqual(typeof bridge.handleMarionAdminTextRuntime, "function", "private runtime bridge handler missing");
const factory = bridge.createMarionBridge();
assert.strictEqual(typeof factory.handleMarionAdminConversation, "function", "factory omits admin conversation handler");
assert.strictEqual(typeof factory.handleMarionAdminTextRuntime, "function", "factory omits admin runtime handler");

(async () => {
  const result = await bridge.handleMarionAdminConversation({
    prompt: "E2E contract probe",
    sessionId: "contract-test",
    adminVerified: true,
    authenticatedOperator: true
  });
  assert.strictEqual(result.publicAgent, "Nyx", "public agent boundary drifted");
  assert.strictEqual(result.surfaceAgent, "Marion", "private surface identity missing");
  assert.strictEqual(result.authority, "Marion", "Marion authority missing");
  assert.strictEqual(result.scope, "private_admin", "private scope missing");
  assert.strictEqual(result.publicSurfaceOnly, false, "private response projected as public-only");
  assert.strictEqual(result.publicFallbackBlocked, true, "public fallback is not blocked");
  assert(/^private:admin:/.test(result.partitionKey), "private memory partition missing");
  console.log("Marion admin E2E contract: PASS");
})().catch((err) => {
  console.error(err && (err.stack || err.message || err));
  process.exitCode = 1;
});

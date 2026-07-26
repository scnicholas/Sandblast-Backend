"use strict";

const path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const adapter = require(path.join(ROOT, "Data/marion/runtime/marionPrivateRuntimeAdapter.js"));
const bridge = require(path.join(ROOT, "Data/marion/runtime/marionBridge.js"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const input = {
    turnId: "private-runtime-phase-a",
    conversationId: "private-runtime-conversation",
    message: "Hi Marion",
    privateAdminConversation: true,
    marionAdminConversation: true,
    directMarionAdminInterface: true,
    passwordFreeTestChat: true,
    sessionVerified: true,
    scope: "private_admin"
  };

  const result = await adapter.invokePrivateRuntime(input, {
    verified: true,
    passwordFreeTestChat: true,
    sessionVerified: true
  });

  assert(result && result.ok === true, "Private runtime did not return a successful result.");
  assert(result.internalNuance, "Private runtime did not retain the internal nuance projection.");
  assert(result.internalNuance.interactionState === "opening", "Greeting was not recognized as an opening state.");
  assert(result.result && result.result.finalEnvelope, "Private runtime final envelope is missing.");
  assert(result.result.finalEnvelope.nuanceInternalOnly === true, "Nuance projection was not marked internal-only.");
  assert(result.result.meta.nuanceHardStopLayer === 24, "Private runtime result hard stop mismatch.");
  assert(!result.result.nuanceContext && !result.result.phaseANuance, "Raw nuance evidence leaked into the private runtime result.");

  const health = bridge.getMarionNuancePhaseAStatus();
  assert(health.hardStopLayer === 24, "Bridge health hard stop mismatch.");
  assert(health.singleAnalysisAuthority === true, "Bridge does not report a single Phase A analysis authority.");

  console.log(JSON.stringify({
    ok: true,
    interactionState: result.internalNuance.interactionState,
    hardStopLayer: result.result.meta.nuanceHardStopLayer
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

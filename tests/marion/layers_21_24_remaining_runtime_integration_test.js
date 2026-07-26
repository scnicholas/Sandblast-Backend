"use strict";

const path = require("path");
const ROOT = path.resolve(__dirname, "../..");

function load(relativePath) {
  return require(path.join(ROOT, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const coordinator = load("Data/marion/runtime/nuance/marionNuancePhaseACoordinator.js");
  const currentTurn = load("Data/marion/runtime/marionCurrentTurnAuthority.js");
  const router = load("Data/marion/runtime/marionIntentRouter.js");
  const finalEnvelope = load("Data/marion/runtime/marionFinalEnvelope.js");
  const completion = load("Data/marion/runtime/completion/marionCompletionFlowCoordinator.js");
  const composer = load("Data/marion/runtime/composeMarionResponse.js");
  const bridge = load("Data/marion/runtime/marionBridge.js");
  const adapter = load("Data/marion/runtime/marionPrivateRuntimeAdapter.js");

  const input = {
    turnId: "phase-a-part2-turn",
    conversationId: "phase-a-part2-conversation",
    privateAdminConversation: true,
    marionAdminConversation: true,
    directMarionAdminInterface: true,
    scope: "private_admin",
    message: "No, no. That is not what I meant. Let us slow down and fix the current section.",
    previousMemory: {}
  };

  const nuance = coordinator.run(input);
  assert(nuance.contract === "nyx.marion.nuance.phaseA/1.0", "Phase A contract mismatch.");
  assert(nuance.layer24.currentState === "correction", "Layer 24 did not recognize the correction state.");

  const prepared = currentTurn.prepareInput({ ...input, nuanceContext: nuance });
  assert(prepared.nuanceCurrentTurnVerified === true, "Current-turn nuance was not verified.");
  assert(prepared.nuanceCorrectionOverride === true, "Correction precedence was not applied.");

  const routeResult = await Promise.resolve(
    router.routeMarionIntent
      ? router.routeMarionIntent({ ...prepared, phaseANuance: nuance })
      : router.route({ ...prepared, phaseANuance: nuance })
  );

  assert(routeResult.nuanceRouting, "Router did not retain bounded nuance routing metadata.");
  assert(routeResult.nuanceRouting.interactionState === "correction", "Router interaction state mismatch.");
  assert(routeResult.nuanceRouting.emotionInferenceAloneMayChangeIntent === false, "Emotion was allowed to replace intent.");

  const completionResult = completion.analyzeTurn({
    prompt: input.message,
    nuanceContext: nuance,
    conversationFlow: {},
    outcomeFlow: {},
    strategicFlow: {},
    turnId: input.turnId
  });

  assert(completionResult.phaseAHardStopLayer === 24, "Completion coordinator did not expose the Layer 24 architecture stop.");
  assert(completionResult.automaticExecutionAllowed === false, "Completion flow gained execution authority.");

  const envelope = await Promise.resolve(finalEnvelope.createMarionFinalEnvelope({
    ...prepared,
    nuanceContext: nuance,
    reply: "The current section needs correction before closure.",
    intent: "technical_debug",
    domain: "technical",
    routing: { intent: "technical_debug", domain: "technical" }
  }));

  assert(envelope.internalNuance, "Final envelope did not retain the internal nuance projection.");
  assert(envelope.internalNuance.interactionState === "correction", "Final envelope interaction state mismatch.");
  assert(!envelope.nuanceContext && !envelope.phaseANuance, "Raw nuance context leaked into the final transport packet.");

  assert(finalEnvelope.MARION_LAYER_HARD_STOP === 24, "Final envelope hard stop mismatch.");
  assert(composer.MARION_LAYER_HARD_STOP === 24, "Composer hard stop mismatch.");
  assert(bridge.MARION_LAYER_HARD_STOP === 24, "Bridge hard stop mismatch.");

  const status = adapter.getStatus();
  assert(status.hardStopLayer === 24, "Private runtime hard stop mismatch.");
  assert(status.nuanceReady === true, "Private runtime did not report Phase A readiness.");

  console.log(JSON.stringify({
    ok: true,
    interactionState: nuance.layer24.currentState,
    completionHardStop: completionResult.phaseAHardStopLayer,
    adapterHardStop: status.hardStopLayer
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

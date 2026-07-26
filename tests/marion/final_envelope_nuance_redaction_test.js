"use strict";

const path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const coordinator = require(path.join(ROOT, "Data/marion/runtime/nuance/marionNuancePhaseACoordinator.js"));
const finalEnvelope = require(path.join(ROOT, "Data/marion/runtime/marionFinalEnvelope.js"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const input = {
    turnId: "redaction-turn",
    privateAdminConversation: true,
    marionAdminConversation: true,
    directMarionAdminInterface: true,
    scope: "private_admin",
    message: "I am frustrated, but keep the reply factual and correct the route.",
    reply: "The route will be corrected without changing the public boundary.",
    intent: "technical_debug",
    domain: "technical",
    routing: { intent: "technical_debug", domain: "technical" }
  };

  input.nuanceContext = coordinator.run(input);
  const result = await Promise.resolve(finalEnvelope.createMarionFinalEnvelope(input));

  assert(result.internalNuance, "Internal nuance summary is missing.");
  assert(!result.nuanceContext && !result.phaseANuance, "Raw Phase A envelope leaked to the final packet.");
  assert(result.finalEnvelope && result.finalEnvelope.nuanceInternalOnly === true, "Final envelope nuance is not internal-only.");
  assert(result.finalEnvelope.rawNuanceEvidenceExposed === false, "Final envelope reports raw nuance evidence exposure.");
  assert(result.meta && result.meta.noUserFacingNuanceDiagnostics === true, "Nuance diagnostics were not blocked from the user-facing reply.");

  const serialized = JSON.stringify(result);
  assert(!serialized.includes("phrase_frustration_possible"), "Raw emotional evidence code leaked into transport.");
  assert(!serialized.includes("repeated_or_explicit_correction"), "Raw correction evidence code leaked into transport.");

  console.log(JSON.stringify({
    ok: true,
    interactionState: result.internalNuance.interactionState,
    confidenceBand: result.internalNuance.confidenceBand,
    rawEvidenceExposed: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

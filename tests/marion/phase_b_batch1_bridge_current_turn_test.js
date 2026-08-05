"use strict";

/**
 * tests/marion/phase_b_batch1_bridge_current_turn_test.js
 *
 * Phase B Batch 1 — Bridge / Current-Turn Cohesion Certification
 *
 * Contract:
 * - Phase B coordinator runs once for the active turn.
 * - Current-turn authority verifies Phase B nuance and correction precedence.
 * - Layer 26 remains the Phase B hard stop.
 * - Later installed layers may raise MarionBridge's global hard stop above 26.
 * - The bridge must still expose the dedicated Phase B status contract at 26.
 */

const assert = require("assert");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const PHASE_B_CONTRACT = "nyx.marion.nuance.phaseB/1.0";
const PHASE_B_HARD_STOP = 26;

function runtimePath(relativePath) {
  return path.join(ROOT, ...relativePath.split("/"));
}

function ownFunction(target, name) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) {
    return null;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    return descriptor && typeof descriptor.value === "function"
      ? descriptor.value
      : null;
  } catch (_) {
    return null;
  }
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function requireRuntime(relativePath) {
  const resolved = runtimePath(relativePath);
  try {
    return require(resolved);
  } catch (error) {
    const wrapped = new Error(`Unable to load required Phase B module: ${relativePath}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

async function main() {
  const coordinator = requireRuntime(
    "Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js"
  );
  const currentTurnAuthority = requireRuntime(
    "Data/marion/runtime/marionCurrentTurnAuthority.js"
  );
  const bridge = requireRuntime(
    "Data/marion/runtime/marionBridge.js"
  );

  const runPhaseB = ownFunction(coordinator, "run");
  const prepareInput = ownFunction(currentTurnAuthority, "prepareInput");
  const getPhaseBStatus = ownFunction(bridge, "getMarionNuancePhaseBStatus");

  assert.strictEqual(
    typeof runPhaseB,
    "function",
    "Phase B coordinator must own a callable run() export."
  );
  assert.strictEqual(
    typeof prepareInput,
    "function",
    "Current-turn authority must own a callable prepareInput() export."
  );
  assert.strictEqual(
    typeof getPhaseBStatus,
    "function",
    "MarionBridge must own getMarionNuancePhaseBStatus()."
  );

  const input = {
    turnId: "b1-current",
    sessionId: "phase-b-batch1-current-turn",
    privateAdminConversation: true,
    marionAdminConversation: true,
    directMarionAdminInterface: true,
    authenticatedOperator: true,
    adminVerified: true,
    serverSideAdminAuth: true,
    scope: "private_admin",
    message: "No, correct the route first."
  };

  const phaseB = await Promise.resolve(runPhaseB(input));

  assert.ok(
    phaseB && typeof phaseB === "object" && !Array.isArray(phaseB),
    "Phase B coordinator must return an object."
  );
  assert.notStrictEqual(
    phaseB.ok,
    false,
    "Phase B coordinator returned a failed result."
  );
  assert.ok(
    phaseB.phaseA && typeof phaseB.phaseA === "object",
    "Phase B result must preserve the Phase A context."
  );

  if (Object.prototype.hasOwnProperty.call(phaseB, "contract")) {
    assert.strictEqual(
      phaseB.contract,
      PHASE_B_CONTRACT,
      "Phase B coordinator contract drifted."
    );
  }
  if (Object.prototype.hasOwnProperty.call(phaseB, "phase")) {
    assert.strictEqual(
      phaseB.phase,
      "B",
      "Phase B coordinator must identify phase B."
    );
  }

  const prepared = await Promise.resolve(
    prepareInput({
      ...input,
      phaseBNuance: phaseB,
      nuanceContext: phaseB.phaseA
    })
  );

  assert.ok(
    prepared && typeof prepared === "object" && !Array.isArray(prepared),
    "Current-turn authority must return a prepared input object."
  );
  assert.strictEqual(
    prepared.phaseBNuanceCurrentTurnVerified,
    true,
    "Current-turn authority did not verify the Phase B nuance packet."
  );
  assert.strictEqual(
    prepared.phaseBCorrectionOverride,
    true,
    "Correction precedence was not preserved for the active turn."
  );
  assert.strictEqual(
    finiteInteger(currentTurnAuthority.MARION_LAYER_HARD_STOP),
    PHASE_B_HARD_STOP,
    "Current-turn authority Phase B hard stop must remain layer 26."
  );

  const status = await Promise.resolve(getPhaseBStatus());

  assert.ok(
    status && typeof status === "object" && !Array.isArray(status),
    "MarionBridge Phase B status must be an object."
  );
  assert.strictEqual(
    status.contract,
    PHASE_B_CONTRACT,
    "MarionBridge Phase B status contract drifted."
  );
  assert.strictEqual(
    finiteInteger(status.hardStopLayer),
    PHASE_B_HARD_STOP,
    "MarionBridge Phase B status must retain the layer-26 hard stop."
  );
  assert.strictEqual(status.phaseAHardStopLayer, 24, "Phase A hard stop must remain layer 24.");
  assert.strictEqual(status.phaseACalledOnce, true, "Phase B must call Phase A exactly once.");
  assert.strictEqual(status.singleAnalysisAuthority, true, "Phase B must retain one analysis authority.");
  assert.strictEqual(status.literalIntentPreserved, true, "Phase B must preserve literal intent.");
  assert.strictEqual(status.rawMarkerEvidenceExposed, false, "Phase B must not expose raw marker evidence.");

  /*
   * MarionBridge can legitimately expose a higher global hard stop after
   * Layers 27–28 are installed. The dedicated Phase B status remains the
   * authoritative layer-26 contract.
   */
  const bridgeGlobalHardStop = finiteInteger(bridge.MARION_LAYER_HARD_STOP);

  assert.ok(
    bridgeGlobalHardStop !== null,
    "MarionBridge must expose an integer global hard-stop layer."
  );
  assert.ok(
    bridgeGlobalHardStop >= PHASE_B_HARD_STOP,
    "MarionBridge global hard stop cannot be below the Phase B hard stop."
  );

  console.log(JSON.stringify({
    ok: true,
    certification: "phase-b-batch1-bridge-current-turn",
    turnId: input.turnId,
    currentTurnVerified: true,
    correctionPrecedence: true,
    phaseAHardStop: status.phaseAHardStopLayer,
    phaseBHardStop: status.hardStopLayer,
    bridgeGlobalHardStop,
    laterLayersInstalled: bridgeGlobalHardStop > PHASE_B_HARD_STOP,
    phaseACalledOnce: status.phaseACalledOnce,
    singleAnalysisAuthority: status.singleAnalysisAuthority,
    literalIntentPreserved: status.literalIntentPreserved,
    rawMarkerEvidenceExposed: status.rawMarkerEvidenceExposed
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

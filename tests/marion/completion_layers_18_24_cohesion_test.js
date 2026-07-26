"use strict";

const path = require("path");
const ROOT = path.resolve(__dirname, "../..");

const coordinator = require(path.join(ROOT, "Data/marion/runtime/nuance/marionNuancePhaseACoordinator.js"));
const crossDomain = require(path.join(ROOT, "Data/marion/runtime/completion/marionCrossDomainContextIntegrator.js"));
const goal = require(path.join(ROOT, "Data/marion/runtime/completion/marionGoalRealignment.js"));
const closure = require(path.join(ROOT, "Data/marion/runtime/completion/marionDecisionClosure.js"));
const completion = require(path.join(ROOT, "Data/marion/runtime/completion/marionCompletionFlowCoordinator.js"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const prompt = "No, that is not the goal change. Correct the current implementation first.";
const nuance = coordinator.run({
  turnId: "completion-cohesion-turn",
  privateAdminConversation: true,
  message: prompt
});

assert(nuance.layer24.currentState === "correction", "Correction state was not detected.");

const crossResult = crossDomain.analyze({
  prompt,
  nuanceContext: nuance,
  conversationFlow: { activeDomain: "technical", activeSubject: "runtime implementation" }
});

assert(crossResult.phaseAContext, "Cross-domain Phase A context is missing.");
assert(crossResult.phaseAContext.culturalInferenceAllowed === false, "Cross-domain layer allowed cultural inference.");
assert(crossResult.phaseAContext.emotionCandidateMayCreateDomain === false, "Emotion was allowed to create a domain.");

const goalResult = goal.analyze({
  prompt,
  nuanceContext: nuance,
  strategicFlow: { objectiveAlignment: { governingObjective: "Repair the runtime safely" } }
});

assert(goalResult.goalChanged === false, "A correction turn incorrectly changed the governing goal.");
assert(goalResult.emotionMayRealignGoal === false, "Emotion was allowed to realign the goal.");

const closureResult = closure.analyze({
  prompt,
  nuanceContext: nuance,
  conversationFlow: {},
  outcomeFlow: {
    outcomeAwareness: { outcomeType: "validation", outcomeText: "passed" },
    commitmentTracking: { openCommitments: [] }
  },
  strategicFlow: {
    objectiveAlignment: { governingObjective: "Repair the runtime safely" },
    predictiveRisk: { overallRisk: "low" },
    pathwaySynthesis: { selectedPathwayId: "validated-baseline" }
  },
  goalRealignment: { activeGoal: "Repair the runtime safely" },
  crossDomainContext: {}
});

assert(closureResult.phaseAControls.correctionOverride === true, "Decision closure did not receive correction precedence.");
assert(closureResult.emotionMayAuthorizeClosure === false, "Emotion was allowed to authorize closure.");
assert(closureResult.culturalMarkersMayAuthorizeClosure === false, "Cultural markers were allowed to authorize closure.");

const completed = completion.analyzeTurn({
  prompt,
  nuanceContext: nuance,
  conversationFlow: {},
  outcomeFlow: {},
  strategicFlow: {},
  turnId: "completion-cohesion-turn"
});

assert(completed.phaseAControls.correctionOverride === true, "Completion coordinator did not retain correction controls.");
assert(completed.conversationArchitectureHardStop === 24, "Completion coordinator architecture hard stop mismatch.");
assert(completed.automaticExecutionAllowed === false, "Completion coordinator gained execution authority.");

console.log(JSON.stringify({
  ok: true,
  interactionState: nuance.layer24.currentState,
  architectureHardStop: completed.conversationArchitectureHardStop,
  completionDecisionLayer: 20
}, null, 2));

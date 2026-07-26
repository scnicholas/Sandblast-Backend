"use strict";
const {spawnSync}=require("child_process");
const path=require("path");
const root=path.resolve(__dirname,"../..");
const syntax=[
 "index.js",
 "Data/marion/runtime/nuance/marionNuanceEnvelope.js",
 "Data/marion/runtime/nuance/marionConversationalSignalNormalizer.js",
 "Data/marion/runtime/nuance/marionEmotionalCueDetector.js",
 "Data/marion/runtime/nuance/marionEmotionalConfidenceGate.js",
 "Data/marion/runtime/nuance/marionInteractionStateTracker.js",
 "Data/marion/runtime/nuance/marionNuanceCarryPolicy.js",
 "Data/marion/runtime/nuance/marionCulturalCompatibilityBoundary.js",
 "Data/marion/runtime/nuance/marionNuancePhaseACoordinator.js",
 "Data/marion/runtime/emotion/emotionRuntime.js",
 "Data/marion/runtime/conversation/marionConversationProgression.js",
 "Data/marion/runtime/conversation/marionContextPivot.js",
 "Data/marion/runtime/conversation/marionInteractionCalibration.js",
 "Data/marion/runtime/conversation/marionOutcomeAwareness.js",
 "Data/marion/runtime/conversation/marionCommitmentTracker.js",
 "Data/marion/runtime/conversation/marionAnticipatoryGuidance.js",
 "Data/marion/runtime/conversation/marionOutcomeFlowCoordinator.js",
 "Data/marion/runtime/conversation/marionConversationLayerRegistry.js",
 "Data/marion/runtime/strategy/marionStrategicObjectiveAlignment.js",
 "Data/marion/runtime/strategy/marionPredictiveRiskModel.js",
 "Data/marion/runtime/strategy/marionStrategicPathwaySynthesizer.js",
 "Data/marion/runtime/strategy/marionStrategicFlowCoordinator.js"
];
const tests=[
 "tests/marion/layers_21_24_core_integration_test.js",
 "tests/marion/layers_9_24_partial_cohesion_test.js",
 "tests/marion/layers_21_24_gap_refinement_test.js",
 "tests/marion/layers_15_17_nuance_boundary_test.js"
];
function run(args){const out=spawnSync(process.execPath,args,{cwd:root,encoding:"utf8"});if(out.status!==0){process.stderr.write(out.stdout||"");process.stderr.write(out.stderr||"");process.exit(out.status||1);}if(out.stdout)process.stdout.write(out.stdout);}
for(const file of syntax)run(["--check",file]);
for(const file of tests)run([file]);
console.log(`PASS verify_phase_a_part1 (${syntax.length} syntax checks, ${tests.length} suites)`);

"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const CONFLICT_RE = /^(?:<<<<<<<|=======|>>>>>>>)/m;
function full(rel){ return path.join(ROOT, ...String(rel).split("/")); }
function read(rel){
  const file=full(rel);
  assert.ok(fs.existsSync(file), `Required file is missing: ${rel}`);
  const text=fs.readFileSync(file,"utf8");
  assert.strictEqual(CONFLICT_RE.test(text), false, `Unresolved merge-conflict marker: ${rel}`);
  return text;
}
function load(rel){
  const file=full(rel); read(rel);
  try { return require(file); }
  catch(error){
    const wrapped=new Error(`Required module failed during load: ${rel}\n${error && error.message ? error.message : error}`);
    wrapped.cause=error; throw wrapped;
  }
}
function isObj(v){ return !!v && typeof v==="object" && !Array.isArray(v); }
function ownFn(api,names){
  if(typeof api==="function") return api;
  for(const name of names){
    const d=api && Object.getOwnPropertyDescriptor(api,name);
    if(d && typeof d.value==="function") return d.value.bind(api);
  }
  return null;
}

const groups={
  emotion:["Data/marion/runtime/emotion/emotionRuntime.js"],
  conversation:[
    "Data/marion/runtime/conversation/marionConversationProgression.js",
    "Data/marion/runtime/conversation/marionContextPivot.js",
    "Data/marion/runtime/conversation/marionInteractionCalibration.js",
    "Data/marion/runtime/conversation/marionOutcomeAwareness.js",
    "Data/marion/runtime/conversation/marionCommitmentTracker.js",
    "Data/marion/runtime/conversation/marionAnticipatoryGuidance.js",
    "Data/marion/runtime/conversation/marionOutcomeFlowCoordinator.js",
    "Data/marion/runtime/conversation/marionConversationLayerRegistry.js"
  ],
  completion:[
    "Data/marion/runtime/completion/marionCompletionFlowCoordinator.js",
    "Data/marion/runtime/completion/marionCrossDomainContextIntegrator.js",
    "Data/marion/runtime/completion/marionDecisionClosure.js",
    "Data/marion/runtime/completion/marionGoalRealignment.js"
  ],
  strategy:[
    "Data/marion/runtime/strategy/marionStrategicObjectiveAlignment.js",
    "Data/marion/runtime/strategy/marionPredictiveRiskModel.js",
    "Data/marion/runtime/strategy/marionStrategicPathwaySynthesizer.js",
    "Data/marion/runtime/strategy/marionStrategicFlowCoordinator.js"
  ]
};
let count=0;
for(const [group,files] of Object.entries(groups)){
  for(const file of files){
    const api=load(file);
    assert.ok(api && (typeof api==="object" || typeof api==="function"), `${group} runtime did not expose an API: ${file}`);
    count++;
  }
}
const strategic=read("Data/marion/runtime/strategy/marionStrategicFlowCoordinator.js");
assert.match(strategic,/MARION_NUANCE_PHASE_A|nuanceCannotAuthorizeAction/i,"Strategic flow is missing its Phase A non-authoritative boundary.");
const decision=read("Data/marion/runtime/completion/marionDecisionClosure.js");
assert.match(decision,/HARD_STOP_LAYER\s*=\s*24|conversationArchitectureHardStop\s*:\s*HARD_STOP_LAYER/i,"Completion decision boundary is not Phase-A-aware.");
console.log(`PASS layers_21_24_remaining_runtime_integration_test (${count} runtime modules)`);

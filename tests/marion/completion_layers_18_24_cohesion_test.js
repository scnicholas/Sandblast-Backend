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

const files=[
  "Data/marion/runtime/completion/marionCompletionFlowCoordinator.js",
  "Data/marion/runtime/completion/marionCrossDomainContextIntegrator.js",
  "Data/marion/runtime/completion/marionDecisionClosure.js",
  "Data/marion/runtime/completion/marionGoalRealignment.js"
];
for(const file of files) load(file);
const flow=read(files[0]);
const closure=read(files[2]);
assert.match(flow,/completionDecisionLayer\s*:\s*20|hardStopAtLayer20|MARION_LAYER_HARD_STOP/i,"Completion coordinator no longer preserves the Layer 20 decision boundary.");
assert.match(flow,/HARD_STOP_LAYER\s*=\s*24|phaseAHardStopLayer\s*:\s*HARD_STOP_LAYER|conversationArchitectureHardStop\s*:\s*HARD_STOP_LAYER/i,"Completion coordinator is missing the Phase A Layer 24 architecture boundary.");
assert.match(closure,/correctionOverride|current_turn_correction_unresolved|phaseAClosureBlocked/i,"Decision closure does not protect current-turn corrections.");
assert.match(closure,/closureAuthorized\s*:\s*false|emotionMayAuthorizeClosure\s*:\s*false/i,"Decision closure authority boundary is missing.");
console.log("PASS completion_layers_18_24_cohesion_test");

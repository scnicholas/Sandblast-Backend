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

const completion=read("Data/marion/runtime/completion/marionCompletionFlowCoordinator.js");
const decision=read("Data/marion/runtime/completion/marionDecisionClosure.js");
const coordinator=read("Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js");
assert.match(completion,/completionDecisionLayer\s*:\s*20|hardStopAtLayer20/i,"Layer 20 completion decision boundary is missing.");
assert.match(completion,/HARD_STOP_LAYER\s*=\s*24|phaseAHardStopLayer/i,"Phase A Layer 24 architecture boundary is missing.");
assert.match(coordinator,/HARD_STOP_LAYER\s*=\s*26|hardStopLayer\s*:\s*26|MARION_LAYER_HARD_STOP/i,"Phase B Layer 26 boundary is missing.");
assert.match(decision,/correctionOverride|current_turn_correction_unresolved|phaseAClosureBlocked/i,"Correction must block stale closure.");
assert.doesNotMatch(coordinator,/automaticExecutionAllowed\s*:\s*true/i,"Phase B coordinator enables automatic execution.");
console.log("PASS layers_18_26_completion_boundary_contract_test");

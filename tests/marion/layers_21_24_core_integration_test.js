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

const PHASE_A="nyx.marion.nuance.phaseA/1.0";
const files=[
  "Data/marion/runtime/nuance/marionNuanceEnvelope.js",
  "Data/marion/runtime/nuance/marionConversationalSignalNormalizer.js",
  "Data/marion/runtime/nuance/marionEmotionalCueDetector.js",
  "Data/marion/runtime/nuance/marionEmotionalConfidenceGate.js",
  "Data/marion/runtime/nuance/marionInteractionStateTracker.js",
  "Data/marion/runtime/nuance/marionNuanceCarryPolicy.js",
  "Data/marion/runtime/nuance/marionCulturalCompatibilityBoundary.js",
  "Data/marion/runtime/nuance/marionNuancePhaseACoordinator.js"
];
for(const file of files){
  const api=load(file);
  assert.ok(api && (typeof api==="object" || typeof api==="function"), `Module did not expose an API: ${file}`);
}
const coordinator=load("Data/marion/runtime/nuance/marionNuancePhaseACoordinator.js");
const run=ownFn(coordinator,["run","analyze","process"]);
assert.strictEqual(typeof run,"function","Phase A coordinator must expose run/analyze/process.");
const out=run({turnId:"phase-a-core",message:"No, correct the current file first.",locale:"en-CA"});
assert.ok(isObj(out),"Phase A coordinator must return an object.");
assert.ok(!out.contract || out.contract===PHASE_A,"Unexpected Phase A contract.");
assert.notStrictEqual(out.executionAuthorized,true,"Phase A must not authorize execution.");
assert.notStrictEqual(out.automaticExecutionAllowed,true,"Phase A must not enable automatic execution.");
if(isObj(out.layer23) && Object.prototype.hasOwnProperty.call(out.layer23,"explicitEmotionReferenceAllowed")){
  assert.strictEqual(out.layer23.explicitEmotionReferenceAllowed,false,"Correction/low-certainty emotion must not become explicit emotion authority.");
}
if(isObj(out.culturalCompatibility)){
  assert.notStrictEqual(out.culturalCompatibility.culturalInferenceAllowed,true,"Cultural inference must remain disabled.");
  assert.notStrictEqual(out.culturalCompatibility.identityInferenceAllowed,true,"Identity inference must remain disabled.");
}
const serialized=JSON.stringify(out);
assert.ok(Buffer.byteLength(serialized,"utf8")<50000,"Phase A output is unexpectedly unbounded.");
console.log("PASS layers_21_24_core_integration_test");

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

const PHASE_B="nyx.marion.nuance.phaseB/1.0";
const runtime=[
  "Data/marion/runtime/nuance/marionConversationalStanceResolver.js",
  "Data/marion/runtime/nuance/marionPragmaticIntentResolver.js",
  "Data/marion/runtime/nuance/marionPragmaticMarkerRegistry.js",
  "Data/marion/runtime/nuance/marionResponsePosturePolicy.js",
  "Data/marion/runtime/nuance/marionSubtextConfidenceGate.js",
  "Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js",
  "Data/marion/runtime/nuance/marionNuancePhaseBEnvelope.js"
];
for(const file of runtime){
  const api=load(file);
  assert.ok(api && (typeof api==="object" || typeof api==="function"),`Phase B runtime failed to expose API: ${file}`);
}
const coordinator=load(runtime[5]);
const run=ownFn(coordinator,["run","analyze","process"]);
assert.strictEqual(typeof run,"function","Phase B coordinator must expose run/analyze/process.");
const out=run({turnId:"phase-b-unit",message:"No, correct the route first.",privateAdminConversation:true,scope:"private_admin"});
assert.ok(isObj(out),"Phase B coordinator must return an object.");
assert.ok(!out.contract || out.contract===PHASE_B,"Unexpected Phase B contract.");
assert.notStrictEqual(out.executionAuthorized,true,"Phase B cannot authorize execution.");
assert.notStrictEqual(out.automaticExecutionAllowed,true,"Phase B cannot enable automatic execution.");
if(Object.prototype.hasOwnProperty.call(out,"hardStopLayer")) assert.strictEqual(Number(out.hardStopLayer),26,"Dedicated Phase B hard stop must be 26.");
console.log("PASS layers_25_26_unit_test");

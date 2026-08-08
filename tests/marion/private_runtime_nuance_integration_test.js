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

const bridgeText=read("Data/marion/runtime/marionBridge.js");
const composerText=read("Data/marion/runtime/composeMarionResponse.js");
const currentText=read("Data/marion/runtime/marionCurrentTurnAuthority.js");
const adapterText=read("Data/marion/runtime/marionPrivateRuntimeAdapter.js");
for(const [name,text] of Object.entries({bridgeText,composerText,currentText,adapterText})){
  assert.ok(text.length>0,`${name} is empty.`);
}
assert.match(bridgeText,/MARION_NUANCE_PHASE_A_BRIDGE_INTEGRATION|nyx\.marion\.nuance\.phaseA\/1\.0/i,"MarionBridge Phase A integration is missing.");
assert.match(bridgeText,/MARION_NUANCE_PHASE_B|nyx\.marion\.nuance\.phaseB\/1\.0/i,"MarionBridge Phase B integration is missing.");
assert.match(composerText,/nuanceInternalOnly|internalNuance/i,"Composer does not preserve internal-only nuance projection.");
assert.match(currentText,/current.?turn|correction/i,"Current-turn authority is missing correction/current-turn semantics.");
assert.doesNotMatch(composerText,/rawMarkerEvidenceExposed\s*:\s*true|rawNuanceEvidenceExposed\s*:\s*true/i,"Composer permits raw nuance evidence exposure.");
const bridge=load("Data/marion/runtime/marionBridge.js");
if(typeof bridge.getMarionNuancePhaseAStatus==="function"){
  const status=bridge.getMarionNuancePhaseAStatus();
  assert.ok(isObj(status),"Phase A bridge status must be an object.");
  assert.strictEqual(Number(status.hardStopLayer),24,"Dedicated Phase A bridge status must remain at Layer 24.");
  assert.notStrictEqual(status.rawEvidencePubliclyExposed,true,"Phase A raw evidence must stay private.");
}
console.log("PASS private_runtime_nuance_integration_test");

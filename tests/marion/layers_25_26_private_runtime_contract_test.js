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

const bridge=load("Data/marion/runtime/marionBridge.js");
const composerText=read("Data/marion/runtime/composeMarionResponse.js");
const bridgeText=read("Data/marion/runtime/marionBridge.js");
assert.match(bridgeText,/nyx\.marion\.nuance\.phaseB\/1\.0|MARION_NUANCE_PHASE_B/i,"MarionBridge is missing Phase B integration.");
assert.match(composerText,/nuanceInternalOnly\s*:\s*true|internalNuance/i,"Composer is missing internal-only Phase B projection.");
assert.doesNotMatch(composerText,/rawMarkerEvidenceExposed\s*:\s*true/i,"Composer enables raw Phase B evidence exposure.");
assert.strictEqual(typeof bridge.getMarionNuancePhaseBStatus,"function","MarionBridge must expose getMarionNuancePhaseBStatus().");
const status=bridge.getMarionNuancePhaseBStatus();
assert.ok(isObj(status),"Phase B bridge status must be an object.");
assert.strictEqual(Number(status.hardStopLayer),26,"Dedicated Phase B bridge status must remain Layer 26.");
assert.notStrictEqual(status.automaticExecutionAllowed,true,"Phase B bridge cannot authorize execution.");
console.log("PASS layers_25_26_private_runtime_contract_test");

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

const rel="utils/stateSpine.js";
const text=read(rel);
const api=load(rel);
assert.match(text,/nyx\.marion\.nuanceState\.phaseB\/1\.0|PHASE_B_STATE_CONTRACT/i,"State Spine is missing the Phase B state contract.");
assert.match(text,/approvedStatePatch|approvedPatch/i,"State Spine is missing approved-patch-only carry.");
assert.match(text,/rawMarkerEvidenceCarryAllowed\s*:\s*false|rawMarkerEvidence/i,"State Spine is missing raw marker evidence containment.");
assert.match(text,/crossPartitionCarryAllowed\s*:\s*false|partitionClass/i,"State Spine is missing partition containment.");
assert.ok(api && (typeof api==="object"||typeof api==="function"),"State Spine failed to load.");
console.log("PASS phase_b_state_spine_integration_test");

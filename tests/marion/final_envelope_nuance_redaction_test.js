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

const rel="Data/marion/runtime/marionFinalEnvelope.js";
const text=read(rel);
const api=load(rel);
assert.match(text,/MARION_NUANCE_PHASE_A_FINAL_ENVELOPE_INTEGRATION|nyx\.marion\.nuance\.phaseA\/1\.0/i,"Final envelope is missing Phase A integration.");
assert.match(text,/nuanceInternalOnly\s*:\s*true/i,"Final envelope must mark nuance as internal-only.");
assert.match(text,/rawNuanceEvidenceExposed\s*:\s*false|rawMarkerEvidenceExposed\s*:\s*false/i,"Final envelope must explicitly block raw nuance evidence.");
assert.doesNotMatch(text,/rawNuanceEvidenceExposed\s*:\s*true|rawMarkerEvidenceExposed\s*:\s*true/i,"Final envelope contains an enabled raw-evidence exposure path.");
assert.ok(api && (typeof api==="object" || typeof api==="function"),"Final envelope failed to load.");
console.log("PASS final_envelope_nuance_redaction_test");

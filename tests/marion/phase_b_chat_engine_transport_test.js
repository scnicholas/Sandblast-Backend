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

const rel="utils/chatEngine.js";
const text=read(rel);
const api=load(rel);
assert.match(text,/MARION_NUANCE_PHASE_B_CHATENGINE_TRANSPORT|phaseBTransportAuthority\s*:\s*"chatEngine_transport_only"|MARION_NUANCE_PHASE_B_TRANSPORT_ONLY/i,"Chat Engine is missing Phase B transport-only integration.");
assert.match(text,/semanticAnalysisPerformed\s*:\s*false|PHASE_B_SEMANTIC_ANALYSIS_ALLOWED\s*=\s*false/i,"Chat Engine transport must not become semantic authority.");
assert.match(text,/rawMarkerEvidenceExposed\s*:\s*false|publicNuanceProjectionAllowed\s*:\s*false/i,"Chat Engine is missing public nuance redaction.");
assert.ok(api && (typeof api==="object"||typeof api==="function"),"Chat Engine failed to load.");
console.log("PASS phase_b_chat_engine_transport_test");

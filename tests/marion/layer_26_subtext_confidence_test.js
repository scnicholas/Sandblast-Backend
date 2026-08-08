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

const coordinator=load("Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js");
const run=ownFn(coordinator,["run","analyze","process"]);
assert.strictEqual(typeof run,"function");
const out=run({turnId:"subtext-test",message:"Fine. Just fix the current file.",privateAdminConversation:true,scope:"private_admin"});
assert.ok(isObj(out) && isObj(out.subtextGate),"Phase B output must expose the subtext confidence gate.");
assert.notStrictEqual(out.subtextGate.literalIntentPreserved,false,"Literal intent must be preserved.");
assert.notStrictEqual(out.subtextGate.executionAuthorized,true,"Subtext confidence cannot authorize execution.");
const text=JSON.stringify(out);
assert.doesNotMatch(text,/"rawMarkerEvidenceExposed"\s*:\s*true/i,"Raw marker evidence was exposed.");
console.log("PASS layer_26_subtext_confidence_test");

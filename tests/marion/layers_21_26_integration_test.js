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
const out=run({turnId:"layers-21-26",message:"No, correct this first, then continue.",privateAdminConversation:true,scope:"private_admin"});
assert.ok(isObj(out),"Phase B coordinator output missing.");
assert.ok(isObj(out.phaseA),"Phase B must preserve embedded Phase A context.");
if(out.phaseA.contract) assert.strictEqual(out.phaseA.contract,"nyx.marion.nuance.phaseA/1.0");
assert.ok(isObj(out.layer25),"Layer 25 missing.");
assert.ok(isObj(out.layer26),"Layer 26 missing.");
assert.notStrictEqual(out.automaticExecutionAllowed,true,"Layers 21-26 must remain non-executing.");
if(Object.prototype.hasOwnProperty.call(out,"phaseACalledOnce")) assert.strictEqual(out.phaseACalledOnce,true,"Phase A must be called once.");
console.log("PASS layers_21_26_integration_test");

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
const out=run({turnId:"stance-test",message:"No, that is not what I asked. Correct the route first.",privateAdminConversation:true,scope:"private_admin"});
assert.ok(isObj(out) && isObj(out.layer25),"Phase B output must expose Layer 25 stance.");
assert.ok(typeof out.layer25.primaryStance==="string" && out.layer25.primaryStance.trim(),"Layer 25 primary stance is missing.");
assert.ok(!Number.isNaN(Number(out.layer25.confidence||0)),"Layer 25 confidence is invalid.");
assert.notStrictEqual(out.layer25.executionAuthorized,true,"Stance resolution cannot authorize execution.");
console.log("PASS layer_25_stance_resolution_test");

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
const base={message:"No, correct the route first.",privateAdminConversation:true,scope:"private_admin"};
const textOut=run({...base,turnId:"parity-text",inputSource:"text"});
const voiceOut=run({...base,turnId:"parity-voice",inputSource:"voice"});
for(const out of [textOut,voiceOut]){
  assert.ok(isObj(out) && isObj(out.layer25) && isObj(out.layer26),"Parity output missing Layers 25/26.");
}
assert.strictEqual(String(textOut.layer26.literalIntent||""),String(voiceOut.layer26.literalIntent||""),"Voice/text literal intent drifted.");
assert.strictEqual(String(textOut.layer26.primaryPragmaticIntent||""),String(voiceOut.layer26.primaryPragmaticIntent||""),"Voice/text pragmatic intent drifted.");
assert.strictEqual(String(textOut.layer25.primaryStance||""),String(voiceOut.layer25.primaryStance||""),"Voice/text stance drifted.");
console.log("PASS layers_25_26_voice_text_parity_test");

"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ROOT=path.resolve(__dirname,"../../..");
const supervisor=require(path.join(ROOT,"Data/marion/runtime/supervision/marionCognitiveSupervisor.js"));

test("Layer 29 cognitive supervision preserves reply authority and disables execution",async()=>{
  const base={reply:"Existing Layers 1-26 final reply.",displayReply:"Existing Layers 1-26 final reply.",handled:true,final:true,executionAuthorized:false};
  const out=await supervisor.supervise({baseEnvelope:base,prompt:"Plan the next backend integration without changing the reply."});
  assert.equal(out.reply,base.reply);
  assert.equal(out.displayReply,base.displayReply);
  assert.equal(out.executionAuthorized,false);
  assert.equal(out.cognitiveSupervisor.layer29Integrated,true);
  assert.equal(out.cognitiveSupervisor.hardStopLayer,29);
  assert.equal(out.cognitiveSupervisor.replyAuthorityPreserved,true);
});

test("Layer 29 integration is mounted through bridge while composer remains untouched",()=>{
  const bridge=fs.readFileSync(path.join(ROOT,"Data/marion/runtime/marionBridge.js"),"utf8");
  const runtimeIndex=fs.readFileSync(path.join(ROOT,"Data/marion/runtime/index.js"),"utf8");
  assert.match(bridge,/MARION_LAYERS_27_29_BRIDGE_COHESION_V1_START/);
  assert.match(bridge,/supervision\/marionCognitiveSupervisor\.js/);
  assert.match(runtimeIndex,/HARD_STOP_LAYER:29/);
  assert.equal(fs.existsSync(path.join(ROOT,"Data/marion/runtime/composeMarionResponse.js")),false);
});

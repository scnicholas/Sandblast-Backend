"use strict";
const fs=require("fs");
const path=require("path");
const {spawnSync}=require("child_process");
const ROOT=path.resolve(__dirname,"../..");
const runtime=[
  "Data/marion/runtime/nuance/marionConversationalStanceResolver.js",
  "Data/marion/runtime/nuance/marionPragmaticIntentResolver.js",
  "Data/marion/runtime/nuance/marionPragmaticMarkerRegistry.js",
  "Data/marion/runtime/nuance/marionResponsePosturePolicy.js",
  "Data/marion/runtime/nuance/marionSubtextConfidenceGate.js",
  "Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js",
  "Data/marion/runtime/nuance/marionNuancePhaseBEnvelope.js",
  "Data/marion/runtime/marionCurrentTurnAuthority.js",
  "Data/marion/runtime/marionBridge.js"
];
for(const rel of runtime){
  const file=path.join(ROOT,...rel.split("/"));
  if(!fs.existsSync(file)){console.error(`Missing Phase B Batch 1 runtime: ${rel}`);process.exit(1);}
  const c=spawnSync(process.execPath,["--check",file],{cwd:ROOT,encoding:"utf8",timeout:30000,maxBuffer:1024*1024*4});
  if(c.error||c.status!==0){if(c.stderr)process.stderr.write(c.stderr);console.error(`Syntax failed: ${rel}`);process.exit(c.status||1);}
}
const test=path.join(__dirname,"phase_b_batch1_bridge_current_turn_test.js");
if(!fs.existsSync(test)){console.error("Missing phase_b_batch1_bridge_current_turn_test.js");process.exit(1);}
const r=spawnSync(process.execPath,[test],{cwd:ROOT,encoding:"utf8",timeout:60000,maxBuffer:1024*1024*8});
if(r.stdout)process.stdout.write(r.stdout);
if(r.stderr)process.stderr.write(r.stderr);
if(r.error||r.status!==0){console.error("FAILED: phase_b_batch1_bridge_current_turn_test.js");process.exit(r.status||1);}
console.log(JSON.stringify({ok:true,suite:"Marion Phase B Part 2 Batch 1",runtimeFilesChecked:runtime.length,testsPassed:1,hardStopLayer:26},null,2));

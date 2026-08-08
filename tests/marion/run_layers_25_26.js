"use strict";
const fs=require("fs");
const path=require("path");
const {spawnSync}=require("child_process");
const ROOT=path.resolve(__dirname,"../..");
const tests=[
  "layers_25_26_unit_test.js",
  "layer_25_stance_resolution_test.js",
  "layer_26_pragmatic_intent_test.js",
  "layer_26_subtext_confidence_test.js",
  "layers_21_26_integration_test.js",
  "layers_25_26_private_runtime_contract_test.js",
  "layers_25_26_voice_text_parity_test.js",
  "layers_18_26_completion_boundary_contract_test.js"
];
function fail(msg,code=1){console.error(msg);process.exit(code);}
for(const name of tests){
  const file=path.join(__dirname,name);
  if(!fs.existsSync(file)) fail(`Missing Phase B core test: ${name}`);
  let r=spawnSync(process.execPath,["--check",file],{cwd:ROOT,encoding:"utf8",timeout:30000,maxBuffer:1024*1024*4});
  if(r.error) fail(`Syntax spawn failed for ${name}: ${r.error.message}`);
  if(r.status!==0){if(r.stderr)process.stderr.write(r.stderr);fail(`Syntax failed: ${name}`,r.status||1);}
  r=spawnSync(process.execPath,[file],{cwd:ROOT,encoding:"utf8",timeout:60000,maxBuffer:1024*1024*8});
  if(r.stdout)process.stdout.write(r.stdout);
  if(r.stderr)process.stderr.write(r.stderr);
  if(r.error) fail(`Execution spawn failed for ${name}: ${r.error.message}`);
  if(r.status!==0) fail(`FAILED: ${name}`,r.status||1);
  console.log(`PASS: ${name}`);
}
console.log(JSON.stringify({ok:true,suite:"Marion Phase B Layers 25-26 Core",testsPassed:tests.length,hardStopLayer:26},null,2));

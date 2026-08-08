"use strict";
const fs=require("fs");
const path=require("path");
const {spawnSync}=require("child_process");
const ROOT=path.resolve(__dirname,"../..");
const tests=[
  "layers_21_24_remaining_runtime_integration_test.js",
  "private_runtime_nuance_integration_test.js",
  "completion_layers_18_24_cohesion_test.js",
  "final_envelope_nuance_redaction_test.js"
];
function fail(message,code=1){console.error(message);process.exit(code);}
for(const name of tests){
  const file=path.join(__dirname,name);
  if(!fs.existsSync(file)) fail(`Missing Phase A Part 2 test: ${name}`);
  let r=spawnSync(process.execPath,["--check",file],{cwd:ROOT,encoding:"utf8",timeout:30000,maxBuffer:1024*1024*4});
  if(r.error) fail(`Syntax spawn failed for ${name}: ${r.error.message}`);
  if(r.status!==0){process.stderr.write(r.stderr||r.stdout||"");fail(`Syntax failed: ${name}`,r.status||1);}
  r=spawnSync(process.execPath,[file],{cwd:ROOT,encoding:"utf8",timeout:60000,maxBuffer:1024*1024*8});
  if(r.stdout)process.stdout.write(r.stdout);
  if(r.stderr)process.stderr.write(r.stderr);
  if(r.error) fail(`Execution spawn failed for ${name}: ${r.error.message}`);
  if(r.status!==0) fail(`FAILED: ${name}`,r.status||1);
  console.log(`PASS: ${name}`);
}
console.log(JSON.stringify({ok:true,suite:"Marion Phase A Layers 21-24 Critical Integration Part 2",testsPassed:tests.length,phaseAHardStopLayer:24},null,2));

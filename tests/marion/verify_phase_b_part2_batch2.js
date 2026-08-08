"use strict";
const fs=require("fs");
const path=require("path");
const {spawnSync}=require("child_process");
const ROOT=path.resolve(__dirname,"../..");
const tests=[
  "phase_b_state_spine_integration_test.js",
  "phase_b_chat_engine_transport_test.js",
  "phase_b_index_manifest_package_contract_test.js"
];
function fail(msg,code=1){console.error(msg);process.exit(code);}
for(const name of tests){
  const file=path.join(__dirname,name);
  if(!fs.existsSync(file)) fail(`Missing Phase B Batch 2 test: ${name}`);
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
console.log(JSON.stringify({ok:true,suite:"Marion Phase B Part 2 Batch 2",testsPassed:tests.length,hardStopLayer:26},null,2));

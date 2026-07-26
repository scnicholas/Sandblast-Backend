"use strict";
const path=require("path");
const {spawnSync}=require("child_process");

const tests=[
  "phase_b_state_spine_integration_test.js",
  "phase_b_chat_engine_transport_test.js",
  "phase_b_index_manifest_package_contract_test.js"
];

for(const test of tests){
  const result=spawnSync(process.execPath,[path.join(__dirname,test)],{
    encoding:"utf8",
    stdio:"pipe"
  });
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  if(result.status!==0){
    console.error(`FAILED: ${test}`);
    process.exit(result.status||1);
  }
  console.log(`PASS: ${test}`);
}

console.log(JSON.stringify({
  ok:true,
  suite:"Marion Phase B Part 2 Batch 2",
  testsPassed:tests.length,
  hardStopLayer:26
},null,2));

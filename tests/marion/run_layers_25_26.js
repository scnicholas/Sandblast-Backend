"use strict";
const path=require("path"),{spawnSync}=require("child_process");
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
for(const name of tests){const r=spawnSync(process.execPath,[path.join(__dirname,name)],{encoding:"utf8"});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0){console.error(`FAILED: ${name}`);process.exit(r.status||1);}console.log(`PASS: ${name}`);}console.log(JSON.stringify({ok:true,suite:"Marion Phase B new files and tests",testsPassed:tests.length},null,2));

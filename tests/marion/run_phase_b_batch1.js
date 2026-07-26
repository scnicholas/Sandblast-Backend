"use strict";
const path=require("path"),{spawnSync}=require("child_process");
const tests=["phase_b_batch1_conversation_cohesion_test.js","phase_b_batch1_commitment_outcome_boundary_test.js","phase_b_batch1_strategy_completion_boundary_test.js","phase_b_batch1_bridge_current_turn_test.js"];
for(const t of tests){const r=spawnSync(process.execPath,[path.join(__dirname,t)],{encoding:"utf8"});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0)process.exit(r.status||1);console.log(`PASS: ${t}`);}
console.log(JSON.stringify({ok:true,testsPassed:tests.length}));

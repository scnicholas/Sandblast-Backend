"use strict";
const path=require("path");
const cp=require("child_process");
const ROOT=path.resolve(__dirname,"..","..");
const tests=["conversation_flow_runtime_test.js","outcome_flow_runtime_test.js","strategic_flow_runtime_test.js","completion_flow_runtime_test.js","layers_1_20_functional_validation_test.js"];
const results=[];let ok=true;
for(const file of tests){
  const run=cp.spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:"utf8",cwd:ROOT,maxBuffer:40*1024*1024});
  let parsed=null;try{parsed=JSON.parse(run.stdout);}catch(_){parsed={ok:false,stdout:run.stdout,stderr:run.stderr};}
  const pass=run.status===0&&parsed&&parsed.ok===true;ok=ok&&pass;
  results.push({file,pass,status:run.status,summary:parsed&&{ok:parsed.ok,total:parsed.total||parsed.tests||0,passed:parsed.passed||((parsed.failures||[]).length===0?parsed.tests:0)},stderr:run.stderr||""});
}
console.log(JSON.stringify({ok,version:"marion.layers9-20.regression/1.0",hardStopLayer:20,tests:results},null,2));
if(!ok)process.exit(1);

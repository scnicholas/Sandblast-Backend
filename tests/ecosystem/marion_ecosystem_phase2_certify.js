'use strict';
const {spawnSync}=require('child_process');const path=require('path');
for(const name of['marion_ecosystem_phase2_components_test.js','marion_ecosystem_phase2_context_test.js','marion_ecosystem_phase2_conversation_test.js']){
  const r=spawnSync(process.execPath,[path.join(__dirname,name)],{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1);
}
console.log('PASS MARION ECOSYSTEM PHASE 2 STATIC CERTIFICATION');

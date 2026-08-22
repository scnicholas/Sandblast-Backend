
'use strict';
const path=require('path');const {spawnSync}=require('child_process');
const names=['marion_ecosystem_phase4_media_contract_test.js','marion_ecosystem_phase4_media_security_test.js','marion_ecosystem_phase4_media_reliability_test.js','marion_ecosystem_phase4_media_aggregation_test.js','marion_ecosystem_phase4_permissions_test.js','marion_ecosystem_phase4_media_router_test.js','marion_ecosystem_phase4_media_intelligence_test.js'];
for(const name of names){const r=spawnSync(process.execPath,[path.join(__dirname,name)],{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1)}
console.log('PASS MARION ECOSYSTEM PHASE 4 MEDIA INTELLIGENCE STATIC CERTIFICATION');

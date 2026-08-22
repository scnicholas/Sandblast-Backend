'use strict';

const {spawnSync}=require('child_process');
const path=require('path');

const names=[
  'marion_lingosentinel_phase4_contract_test.js',
  'marion_lingosentinel_phase4_security_test.js',
  'marion_lingosentinel_phase4_reliability_test.js',
  'marion_lingosentinel_phase4_circuit_test.js',
  'marion_lingosentinel_phase4_gateway_test.js'
];
for(const name of names){
  const p=path.join(__dirname,name),r=spawnSync(process.execPath,[p],{stdio:'inherit',env:process.env});
  if(r.status!==0)process.exit(r.status||1);
}
console.log('PASS MARION ↔ LINGOSENTINEL PHASE 4 STATIC CERTIFICATION');

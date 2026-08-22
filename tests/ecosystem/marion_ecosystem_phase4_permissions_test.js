
'use strict';
const assert=require('assert');
const B=require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase4Bootstrap');
const P=require('../../Data/marion/runtime/ecosystem/MarionEcosystemPermissions');
B.bootstrap();
for(const id of ['sandblast-channel','sandblast-radio','sandblast-tv','synapse']){
  assert.equal(P.authorize(id,'write',id+'.telemetry').ok,true,id);
  assert.equal(P.authorize(id,'request','marion.analysis').ok,true,id);
  assert.equal(P.authorize(id,'execute',id+'.playback').ok,false,id);
  assert.equal(P.authorize(id,'execute','crm.send_message').ok,false,id);
}
console.log('PASS marion_ecosystem_phase4_permissions_test');

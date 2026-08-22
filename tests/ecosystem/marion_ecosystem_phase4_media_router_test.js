
'use strict';
const assert=require('assert');
const Gateway=require('../../Data/marion/runtime/ecosystem/MarionEcosystemGateway');
const B=require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase4Bootstrap');
const R=require('../../Data/marion/runtime/ecosystem/MarionMediaEventRouter');
const Store=require('../../Data/marion/runtime/ecosystem/MarionMediaAggregationStore');
(async()=>{
  let marionCalls=0;Gateway.registerMarionRunner(async()=>{marionCalls++;return{summary:'should not be called on raw intake'}});B.bootstrap();
  const event={eventId:'router-1',requestId:'req-router-1',traceId:'trace-router-1',sessionId:'session-router-1',component:'sandblast-radio',eventName:'radio.play',campaignId:'campaign-a'};
  const first=await R.route(event);assert.equal(first.ok,true);assert.equal(first.handled,true);assert.equal(first.result.accepted,true);assert.equal(first.result.controls.marionInvoked,false);assert.equal(marionCalls,0);
  const duplicate=await R.route(event);assert.equal(duplicate.ok,true);assert.equal(duplicate.result.duplicate,true);assert.equal(marionCalls,0);
  assert.equal(Store.combined({campaignId:'campaign-a'}).totalEvents,1);
  console.log('PASS marion_ecosystem_phase4_media_router_test');
})().catch(e=>{console.error(e);process.exit(1)});

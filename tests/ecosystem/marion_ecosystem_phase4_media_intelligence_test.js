
'use strict';
const assert=require('assert');
const Gateway=require('../../Data/marion/runtime/ecosystem/MarionEcosystemGateway');
const Store=require('../../Data/marion/runtime/ecosystem/MarionMediaAggregationStore');
const Intelligence=require('../../Data/marion/runtime/ecosystem/MarionMediaIntelligenceAggregator');
(async()=>{
  Store.resetForTests();
  const now=Date.now();
  Store.record({component:'sandblast-channel',eventName:'page.cta_click',sessionId:'a',campaignId:'campaign-x',timestamp:now,value:1});
  Store.record({component:'sandblast-channel',eventName:'advertising.inquiry',sessionId:'b',campaignId:'campaign-x',timestamp:now+1,value:1});
  Store.record({component:'sandblast-tv',eventName:'tv.content_open',sessionId:'c',campaignId:'campaign-x',timestamp:now+2,value:0});
  let calls=0;Gateway.registerMarionRunner(async input=>{calls++;assert.equal(input.mediaIntelligence.aggregatedOnly,true);assert.equal(input.mediaIntelligence.containsRawEvents,false);return{summary:'Advertising signals are rising.',observations:['CTA and inquiry signals are both present.'],recommendations:['Review campaign creative and lead conversion.']}});
  const result=await Intelligence.analyze({campaignId:'campaign-x',since:now-100,until:now+1000});assert.equal(result.ok,true);assert.equal(result.degraded,false);assert.equal(calls,1);assert.equal(result.snapshot.totalEvents,3);assert.match(result.marion.summary,/Advertising/);
  console.log('PASS marion_ecosystem_phase4_media_intelligence_test');
})().catch(e=>{console.error(e);process.exit(1)});

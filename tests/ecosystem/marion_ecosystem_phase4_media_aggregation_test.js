
'use strict';
const assert=require('assert');
const Store=require('../../Data/marion/runtime/ecosystem/MarionMediaAggregationStore');
Store.resetForTests();
const base=1700000000000;
const events=[
  {component:'sandblast-channel',eventName:'page.cta_click',sessionId:'a',campaignId:'campaign-1',timestamp:base,value:1,durationMs:0},
  {component:'sandblast-channel',eventName:'advertising.inquiry',sessionId:'b',campaignId:'campaign-1',timestamp:base+10,value:1,durationMs:0},
  {component:'sandblast-radio',eventName:'radio.play',sessionId:'c',campaignId:'campaign-1',timestamp:base+20,value:0,durationMs:0},
  {component:'sandblast-tv',eventName:'tv.watch_duration',sessionId:'d',campaignId:'campaign-1',timestamp:base+30,value:0,durationMs:120000},
  {component:'synapse',eventName:'synapse.story_open',sessionId:'e',campaignId:'campaign-2',timestamp:base+40,value:0,durationMs:0}
];
for(const e of events)Store.record(e,{windowMs:60000});
const all=Store.combined({since:base-1,until:base+60000});
assert.equal(all.totalEvents,5);assert.equal(all.events['page.cta_click'],1);assert.equal(all.events['advertising.inquiry'],1);assert.equal(all.events['tv.watch_duration'],1);assert.equal(all.totalDurationMs,120000);
const c1=Store.combined({campaignId:'campaign-1',since:base-1,until:base+60000});assert.equal(c1.totalEvents,4);
console.log('PASS marion_ecosystem_phase4_media_aggregation_test');


'use strict';
const assert=require('assert');
const N=require('../../Data/marion/runtime/ecosystem/MarionMediaTelemetryNormalizer');
const C=require('../../Data/marion/runtime/ecosystem/MarionMediaEventContract');

const cases=[
  ['sandblast-channel','page.view'],['sandblast-channel','page.cta_click'],['sandblast-channel','advertising.inquiry'],
  ['sandblast-radio','radio.play'],['sandblast-radio','radio.stop'],['sandblast-radio','radio.session'],
  ['sandblast-tv','tv.content_open'],['sandblast-tv','tv.content_complete'],['sandblast-tv','tv.watch_duration'],
  ['synapse','synapse.story_open'],['synapse','synapse.category_open']
];
for(const [component,eventName] of cases){const r=N.validate({eventId:component+'-'+eventName,sessionId:'s1',component,eventName,pagePath:'/test?email=a@example.com',metadata:{surface:'web'}});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.event.pagePath,'/test');assert.equal(r.event.privacy.queryStringStored,false);}
assert.equal(C.isAllowed('sandblast-radio','tv.content_open'),false);
const bad=N.validate({eventId:'bad',sessionId:'s1',component:'sandblast-radio',eventName:'send.email'});assert.equal(bad.ok,false);
console.log('PASS marion_ecosystem_phase4_media_contract_test');

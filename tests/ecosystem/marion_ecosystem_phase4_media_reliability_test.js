
'use strict';
const assert=require('assert');
const Ledger=require('../../Data/marion/runtime/ecosystem/MarionMediaEventLedger');
const Rate=require('../../Data/marion/runtime/ecosystem/MarionMediaRateLimiter');
Ledger.resetForTests();Rate.resetForTests();
const event={eventId:'e1',component:'sandblast-radio',eventName:'radio.play',sessionId:'s1'};
assert.equal(Ledger.claim(event).duplicate,false);assert.equal(Ledger.claim(event).duplicate,true);
const old=process.env.MEDIA_PHASE4_RATE_LIMIT_PER_MINUTE;process.env.MEDIA_PHASE4_RATE_LIMIT_PER_MINUTE='10';
for(let i=0;i<10;i++)assert.equal(Rate.consume({component:'sandblast-radio',sessionId:'rate-s'},1000+i).ok,true);
assert.equal(Rate.consume({component:'sandblast-radio',sessionId:'rate-s'},1011).ok,false);
if(old===undefined)delete process.env.MEDIA_PHASE4_RATE_LIMIT_PER_MINUTE;else process.env.MEDIA_PHASE4_RATE_LIMIT_PER_MINUTE=old;
console.log('PASS marion_ecosystem_phase4_media_reliability_test');

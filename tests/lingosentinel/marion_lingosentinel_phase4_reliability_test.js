'use strict';

const assert=require('assert');
const L=require('../../Data/marion/runtime/LingoSentinel/MarionLingoSentinelRequestLedger');

L.resetForTests();
const req={requestId:'r1',sessionId:'s1',conversationId:'c1',sourceLanguage:'en',targetLanguage:'fr',message:'Hello'};
assert.equal(L.claim(req).status,'claimed');
assert.equal(L.claim(req).status,'duplicate_inflight');
L.complete('r1',{ok:true,value:7});
const d=L.claim(req);
assert.equal(d.status,'duplicate_completed');
assert.equal(d.cached.value,7);
const conflict=L.claim({...req,message:'Different'});
assert.equal(conflict.status,'conflict');
console.log('PASS marion_lingosentinel_phase4_reliability_test');

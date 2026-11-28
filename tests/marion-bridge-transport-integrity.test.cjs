'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../Data/marion/runtime/marionBridge.js');
const transport=bridge.safeResponse;
function rejected(extra={}) {return {ok:false,final:false,marionFinal:false,canEmit:false,requiresRetry:true,finalEnvelope:{ok:false,final:false,marionFinal:false,requiresRetry:true,reply:''},...extra};}
test('shared, acyclic rejection provenance is not marked circular',()=>{
 const reasons={terminalReason:'drastic_runtime_recovery',completionReason:'drastic_runtime_recovery',trustAllowEmit:false};
 const out=transport(rejected({diagnostics:{first:reasons,second:reasons}}));
 assert.deepEqual(out.diagnostics.first,reasons);
 assert.deepEqual(out.diagnostics.second,reasons);
 assert.equal(out.final,false);assert.equal(out.marionFinal,false);assert.equal(out.canEmit,false);
});
test('true object cycles are bounded and do not crash transport',()=>{
 const reasons={terminalReason:'rejected'};reasons.self=reasons;
 const out=transport(rejected({diagnostics:{reasons}}));
 assert.equal(out.diagnostics.reasons.self,'[Circular]');
 assert.equal(out.final,false);
});
test('sensitive transport diagnostic values are redacted',()=>{
 const out=transport(rejected({diagnostics:{password:'fake-password',apiKey:'fake-token',nested:{authorization:'Bearer fake',reason:'safe_code'}}}));
 assert.equal(out.diagnostics.password,'[redacted]');
 assert.equal(out.diagnostics.apiKey,'[redacted]');
 assert.equal(out.diagnostics.nested.authorization,'[redacted]');
 assert.equal(out.diagnostics.nested.reason,'safe_code');
});
test('prototype-sensitive properties do not survive output projection',()=>{
 const payload=JSON.parse('{"__proto__":{"polluted":true},"constructor":"evil","reason":"verified"}');
 const out=transport(rejected({diagnostics:payload}));
 assert.equal(Object.prototype.hasOwnProperty.call(out.diagnostics,'__proto__'),false);
 assert.equal(Object.prototype.hasOwnProperty.call(out.diagnostics,'constructor'),false);
 assert.equal({}.polluted,undefined);
});
test('legacy false final cannot be promoted by unrelated final flags',()=>{
 const out=transport({ok:true,final:true,marionFinal:true,canEmit:true,reply:'Three finance steps.',finalEnvelope:{ok:false,final:false,marionFinal:false,reply:'Three finance steps.',currentTurnBound:false}});
 assert.equal(out.marionFinal,false);assert.equal(out.canEmit,false);
});
test('a rejected packet remains non-emitting after sanitizer',()=>{
 const out=transport(rejected({diagnostics:{reason:'final_envelope_invalid'}}));
 assert.equal(out.final,false);assert.equal(out.marionFinal,false);assert.equal(out.canEmit,false);
});

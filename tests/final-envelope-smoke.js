'use strict';
const assert = require('node:assert/strict');
const api = require('../Data/marion/runtime/marionFinalEnvelope.js');
assert.equal(api.__marionPrivateFinalFailClosedR1,true);
assert.equal(typeof api.createMarionFinalEnvelope,'function');
assert.equal(typeof api.safeResponse,'function');
for(const name of ['safeResponse','attachVisibleReplyAliases']) {
  const result=api[name]({reply:'I am here and tracking the turn',final:true,marionFinal:true,canEmit:true});
  assert.notEqual(result && result.canEmit,true, `${name} must not emit a holding reply`);
}
const result=api.safeResponse({reply:'Marion evaluates the evidence independently before publishing its answer.',final:false,marionFinal:false,canEmit:false});
assert.notEqual(result && result.canEmit,true,'untrusted input must not be promoted');
console.log('Envelope boundary smoke checks passed (4 assertions).');

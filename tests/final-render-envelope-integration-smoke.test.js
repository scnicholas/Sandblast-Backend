
const assert=require('assert');
const env=require('../Data/marion/runtime/marionFinalEnvelope.js');
const out=env.createMarionFinalEnvelope({reply:'Run the final render validation now.', routing:{intent:'technical_debug',domain:'technical'}, turnId:'t1'});
assert(out.finalRenderTelemetry || (out.finalEnvelope && out.finalEnvelope.finalRenderTelemetry));
const tel=out.finalRenderTelemetry || out.finalEnvelope.finalRenderTelemetry;
assert.strictEqual(tel.publicSurfaceClean, true);
assert.strictEqual(tel.userVisible, false);
assert(!/finalEnvelope|sessionPatch|runtimeTelemetry/.test(out.reply));
console.log('ok envelope final render');

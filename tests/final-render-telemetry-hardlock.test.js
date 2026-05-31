
const assert=require('assert');
const fr=require('../Data/marion/runtime/finalRenderTelemetry.js');
assert(fr.hasPublicRenderLeak('finalEnvelope: bad sessionPatch=abc'));
const clean=fr.sanitizeFinalRenderedReply('Hello user. finalEnvelope: bad sessionPatch=abc');
assert(!fr.hasPublicRenderLeak(clean));
const tel=fr.buildFinalRenderTelemetry({reply:'Hello user. finalEnvelope: bad',canEmit:true,finalEnvelopeTrusted:true});
assert.strictEqual(tel.leakBlocked,true);
assert.strictEqual(tel.userVisible,false);
console.log('ok final render');

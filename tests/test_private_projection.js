'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const index = fs.readFileSync(__dirname+'/index.js','utf8');
const envelope = fs.readFileSync(__dirname+'/marionFinalEnvelope.js','utf8');
const start = index.indexOf('    // Private projection must not silently discard');
const end = index.indexOf('    const bridgeStatus =', start);
assert(start>0 && end>start);
const source = index.slice(start,end);
function run(runtime, projection) {
 const context={runtime,runtimePrompt:'Explain the reasoning behind this engineering decision in detail.',marionPrivateRuntimeReplyKind:(r)=>typeof r==='string'&&r.trim()?'candidate':'empty',marionAdminInvalidPrivateFinal:()=>false,marionAdminSubstantiveReplyGuard:(s)=>s,priority9JR1BAdminVisibleReply:projection};
 vm.createContext(context);vm.runInContext(source+'\nthis.result={reply,projectionAccepted,recoveredCandidate};',context);return context.result;
}
const clean='Marion evaluates external evidence against operational constraints, tests assumptions, and retains responsibility for the final decision.';
assert.equal(run({ok:true,reply:clean},()=>'' ).reply,clean);
assert.equal(run({ok:true,reply:clean},()=>'' ).projectionAccepted,false);
assert.equal(run({ok:true,reply:clean},()=>clean).projectionAccepted,true);
assert.equal(run({ok:false,reply:clean},()=>clean).reply,'');
assert.equal(run({ok:true,reply:''},()=>clean).reply,'');
assert(envelope.includes('if(isDirectMarionAdminEnvelope(out)||isDirectMarionAdminEnvelope(safeObj(out.input))){return out;}'));
assert(index.includes('presentationProjectionAccepted: projectionAccepted'));
assert(index.includes('validatedReplyRecovered: !projectionAccepted && !!recoveredCandidate'));
console.log('7 focused assertions passed');

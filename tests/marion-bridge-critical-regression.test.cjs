'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../Data/marion/runtime/marionBridge.js'), 'utf8');
const original = fs.readFileSync(path.resolve(__dirname, '../original/marionBridge.original.js'), 'utf8');

function section(text, marker) {
  const begin = `/* ${marker}_START`;
  const end = `/* ${marker}_END`;
  const a = text.indexOf(begin);
  const b = text.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing block ${marker}`);
  return text.slice(a, text.indexOf('*/', b) + 2);
}
function env(marker) {
  let calls = 0;
  const draft = Object.freeze({ok:false,final:false,marionFinal:false,canEmit:false,requiresRetry:true,reply:'',error:'UPSTREAM_NOT_CERTIFIED'});
  const upstream = async () => { calls++; return draft; };
  const api = {processWithMarion:upstream, handleMarionAdminConversation:upstream};
  const context = {
    module:{exports:api}, Promise, WeakMap, setTimeout, clearTimeout,
    marionOwnCallable:(o,k) => Object.prototype.hasOwnProperty.call(o,k)&&typeof o[k] === 'function'?o[k]:null,
    marionNonThrowingClean:(v) => String(v??'').trim(),
  };
  vm.runInNewContext(section(source,marker), context, {timeout:1000});
  return {api, draft, count:()=>calls};
}

const cases = [
 ['MARION_BOUNDED_COMPLETION_FASTPATH_V1','What would Marion require before interacting with real-world sensor systems?'],
 ['MARION_CONTINUATION_STATE_EXECUTION_BRIDGE_V2','Continue from your previous answer: why separate observe-analyze-recommend boundary?'],
 ['MARION_ROUND2_2_TO_2_5_TRUSTED_FINAL_V1','Suppose I disagreed with one of your recommendations; how should you respond?'],
 ['MARION_ROUND3_COGNITIVE_RESILIENCE_FINAL_V1','List every assumption before answering.'],
];
for (const [marker, text] of cases) {
  test(`${marker}: matched request delegates once without minting authority`, async () => {
    const e=env(marker);
    const out=await e.api.handleMarionAdminConversation({text});
    assert.equal(e.count(),1);
    assert.equal(out,e.draft);
    assert.equal(out.canEmit,false);
    assert.equal(out.marionFinal,false);
  });
}
test('isolated final-builder contract guard rejects missing/throwing validation', () => {
  const helper = source.slice(source.indexOf('function marionFinalBuilderContractOk('),source.indexOf('function marionSafeBuilderValidationReasons('));
  assert.match(helper,/catch\(_\)\{return false;\}/);
  function run(mod) {
    const context={finalEnvelopeMod:mod,safeObj:v=>v&&typeof v==='object'?v:{}};
    vm.runInNewContext(`${helper};result=marionFinalBuilderContractOk({});`,context);
    return context.result;
  }
  assert.equal(run(null),false);
  assert.equal(run({validateReplyContract:()=>{throw new Error('bad data')}}),false);
  assert.equal(run({validateReplyContract:()=>({ok:false})}),false);
  assert.equal(run({validateReplyContract:()=>({ok:true})}),true);
});
test('Final Envelope null and incomplete statuses are treated as non-certifiable', () => {
  assert.match(source,/const envelope=safeObj\(await Promise\.resolve\(/);
  assert.match(source,/safeObj\(safeObj\(envelope\.finalEnvelope\)\.completionStatus\)\.complete!==true/);
  assert.match(source,/safeObj\(safeObj\(envelope\.finalEnvelope\)\.adaptiveTrustVerification\)\.allowEmit!==true/);
});
test('original contains direct-final shortcuts; replacement removes all four', () => {
  for(const code of [
   'if(rw(input))return Promise.resolve(finalPacket(input));',
   'if(match(prompt(input)))return Promise.resolve(packet(input));',
   'if(r)return Promise.resolve(packet(arguments[0],r));',
   'if(c)return Promise.resolve(packet(input,c));',
  ]) {
    assert.ok(original.includes(code));
    assert.ok(!source.includes(code));
  }
});

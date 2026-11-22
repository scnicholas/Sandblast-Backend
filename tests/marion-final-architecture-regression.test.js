'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mod = require(path.resolve(__dirname, '../Data/marion/runtime/marionFinalEnvelope.js'));
const sample = () => ({
  ok:true, reply:'Here is a concise, current-turn response that preserves the requested answer.',
  turnId:'runtime-bundle-turn',currentTurnBound:true,semanticAuthority:'marion',
  intent:'simple_chat',domain:'general'
});
const denied = x => {
  assert.equal(x.ok,false);
  assert.equal(x.final,false);
  assert.equal(x.marionFinal,false);
  assert.equal(x.canEmit,false);
  assert.equal(x.reply,'');
  assert.equal(x.finalEnvelope?.signature,'');
};
test('canonical builder retains valid signed current-turn output',async()=>{
  const x=await mod.createMarionFinalEnvelope(sample());
  assert.equal(x.ok,true);
  assert.equal(x.final,true);
  assert.equal(x.marionFinal,true);
  assert.equal(x.finalEnvelope.signature,'MARION_FINAL_AUTHORITY');
  assert.equal(x.finalEnvelope.currentTurnBound,true);
  assert.equal(mod.validateReplyContract(x.finalEnvelope).ok,true);
  assert.equal(x.reply,x.finalEnvelope.reply);
});
test('buildResponse and finalizeTurn preserve certified output',async()=>{
  for(const k of ['buildResponse','createResponse','finalizeTurn']){
    const x=await mod[k](sample());
    assert.equal(x.marionFinal,true,k);
    assert.equal(mod.validateReplyContract(x.finalEnvelope).ok,true,k);
  }
});
test('explicit false ok cannot become a signed final',async()=>{
  denied(await mod.createMarionFinalEnvelope({...sample(),ok:false}));
});
test('explicit false canEmit cannot become a signed final',async()=>{
  denied(await mod.createMarionFinalEnvelope({...sample(),canEmit:false}));
});
test('blocked completion cannot become a signed final',async()=>{
  denied(await mod.createMarionFinalEnvelope({...sample(),completionStatus:{complete:false}}));
});
test('explicit nested final-envelope denial cannot become certified',async()=>{
  denied(await mod.createMarionFinalEnvelope({...sample(),finalEnvelope:{currentTurnBound:false}}));
});
test('short holding reply is not certified',async()=>{
  const x=await mod.createMarionFinalEnvelope({...sample(),reply:'Please retry'});
  assert.notEqual(x.marionFinal,true);
  assert.notEqual(x.canEmit,true);
});
test('alias projection cannot elevate an unsigned packet',async()=>{
  const x=await mod.attachVisibleReplyAliases({reply:'A substantive response that has not passed the authority gate.'});
  assert.notEqual(x.marionFinal,true);
  assert.notEqual(x.canEmit,true);
});
test('preserves public vs private display contracts for certified reply',async()=>{
  const x=await mod.createMarionFinalEnvelope(sample());
  assert.equal(x.finalEnvelope.semanticAuthority,'marion');
  assert.equal(x.reply,x.payload.reply);
});

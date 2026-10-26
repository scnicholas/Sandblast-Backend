'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const router=require('../Data/marion/runtime/marionIntentRouter.js');
const query='Marion, evaluate the strategic advantages and risks of migrating Sandblast Radio from BR Logic to our own streaming infrastructure. Identify three priorities and recommend an implementation sequence.';
const variant='Marion, analyse the advantages and risks of moving Sandblast Radio from BR Logic to our own streaming infrastructure. Recommend three business and technical priorities, explain the trade-offs, and provide a phased migration plan.';
for(const [name,q] of [['original',query],['variant',variant]]){
  test(name+' private strategy',()=>{const r=router.routeMarionIntent({prompt:q,privateAdminConversation:true,scope:'private_admin'});assert.equal(r.routing.domain,'business');assert.equal(r.marionIntent.intent,'business_strategy');assert.equal(r.routing.knowledgeDomain,'');assert.equal(r.routing.terminalReply,'');assert.equal(r.routing.substantiveAnswerRequired,true)});
  test(name+' public classification',()=>{const r=router.routeMarionIntent({prompt:q});assert.equal(r.routing.domain,'business');assert.equal(r.marionIntent.intent,'business_strategy')});
}
test('ordinary radio music request stays out of migration override',()=>{const q='Play reggae music on Sandblast Radio.';const r=router.routeMarionIntent({prompt:q});assert.notEqual(r.meta?.radioStrategyCurrentTurnVersion,router.MARION_RADIO_STRATEGY_CURRENT_TURN_VERSION)});
test('security-specific radio request stays out of migration override',()=>{const q='How do I protect the radio server against ransomware?';const r=router.routeMarionIntent({prompt:q});assert.notEqual(r.meta?.radioStrategyCurrentTurnVersion,router.MARION_RADIO_STRATEGY_CURRENT_TURN_VERSION)});

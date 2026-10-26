'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const bridgePath = path.resolve(__dirname,'../Data/marion/runtime/marionBridge.js');
const bridge = require(bridgePath);
test('export contract is available without changing administrator handler', () => {
  assert.equal(typeof bridge.handleMarionAdminConversation,'function');
  assert.equal(typeof bridge.configureMarionNeonAdvisory,'function');
  assert.equal(bridge.configureMarionNeonAdvisory({}),false);
});
test('trusted callback is required and the hook can be configured', () => {
  assert.equal(bridge.configureMarionNeonAdvisory({verifySession:() => null}),true);
});
test('unverified private sessions never invoke model adapter', async () => {
  process.env.SB_MARION_NEON_PRIVATE_ADVISORY='true';
  bridge.configureMarionNeonAdvisory({verifySession:()=>null});
  const result=await bridge.handleMarionAdminConversation({prompt:'Review radio migration',privateAdminConversation:true,marionAdminConversation:true});
  assert.equal(result.neonModelAdvisory.available,false);
  assert.equal(result.neonModelAdvisory.reason,'ineligible');
});
test('verified session reaches model adapter and advisory never becomes final authority', async () => {
  process.env.SB_MARION_NEON_PRIVATE_ADVISORY='true';
  const originalLoad=Module._load;
  let calls=0;
  Module._load=function(request,parent,isMain) {
    if (request==='../../../Utils/marionNeonIntelligence.js') return {requestIntelligence:async (args)=>{calls++;assert.equal(args.session.scope,'private_admin');assert.equal(args.session.audience,'owner');return {ok:true,advisory:'Internal recommendation only'};}};
    return originalLoad.apply(this,arguments);
  };
  try {
    bridge.configureMarionNeonAdvisory({verifySession:(input)=> input.__marionNeonPrivateTicket==='ticket' ? {source:'server-verified-session',authorized:true,scope:'private_admin',audience:'owner',sessionId:'session123456',}:null});
    const result=await bridge.handleMarionAdminConversation({prompt:'Review radio migration',privateAdminConversation:true,marionAdminConversation:true,__marionNeonPrivateTicket:'ticket'});
    assert.equal(calls,1);
    assert.equal(result.neonModelAdvisory.available,true);
    assert.equal(result.neonModelAdvisory.usedAsFinalAuthority,false);
    assert.equal(JSON.stringify(result).includes('Internal recommendation only'),false);
    assert.equal(JSON.stringify(result).includes('ticket'),false);
  } finally { Module._load=originalLoad; }
});
test('feature flag off prevents the model handoff', async () => {
  process.env.SB_MARION_NEON_PRIVATE_ADVISORY='false';
  bridge.configureMarionNeonAdvisory({verifySession:()=>({source:'server-verified-session',authorized:true,scope:'private_admin',audience:'owner',sessionId:'session123456'})});
  const result=await bridge.handleMarionAdminConversation({prompt:'Radio strategy',privateAdminConversation:true,marionAdminConversation:true});
  assert.equal(result.neonModelAdvisory.available,false);
});

'use strict';
const assert=require('node:assert/strict');
const gateway=require('../Data/marion/runtime/MarionAdminConsoleGateway.js');
const valid={adminVerified:true,sessionVerified:true,sessionId:'test-session-123',role:'owner'};
(async()=>{
  const g=new gateway.MarionAdminConsoleGateway();
  assert.equal((await g.handleApprove({requestId:'missing'},valid)).approved,false,'Unknown approval must not succeed');
  assert.equal((await g.handleApprove({requestId:'missing'},valid)).statusCode,404);
  assert.equal((await g.handleApprove({requestId:'missing'},{})).ok,false,'unauthenticated approval denied');
  assert.equal((await g.handleEmergency({confirmation:'CONFIRM_MARION_EMERGENCY'},{})).ok,false,'emergency remains private');
  assert.equal(g.classifyRisk('delete records',{risk:'low'}),'high','risk hint cannot downgrade high risk');
  assert.equal(g.classifyRisk('hello',{risk:'critical'}),'critical','risk hint can raise risk');
  console.log('6 gateway regression assertions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

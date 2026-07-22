"use strict";
const assert=require("assert");
const bridge=require("../Data/marion/runtime/marionBridge.js");
const guard=require("../Data/marion/runtime/marionCurrentTurnAuthority.js");
(async()=>{
  const base={privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,passwordFreeTestChat:true,isolatedSession:true,lane:"marion_admin",sessionId:"widget-shape-session"};
  const first=await bridge.processWithMarion({...base,newSession:true,turnId:"w1",text:"Do a surgical autopsy on the JavaScript law-routing file.",userText:"Do a surgical autopsy on the JavaScript law-routing file."});
  assert.equal(first.domain,"technical");
  const second=await bridge.processWithMarion({...base,newSession:false,turnId:"w2",text:"Go deeper.",userText:"Go deeper."});
  assert.equal(second.domain,"technical");
  const reply=guard.replyFrom(second);
  assert(!/not legal advice|legal-risk triage|jurisdiction sensitivity/i.test(reply));
  assert(/technical|router|runtime|code|javascript|state|final envelope/i.test(reply));
  const diag=bridge._continuityCacheDiagnostics();
  assert(diag.size>=1);
  console.log(JSON.stringify({ok:true,firstDomain:first.domain,secondDomain:second.domain,reply:reply.slice(0,260),cache:diag},null,2));
})().catch(e=>{console.error(e);process.exit(1)});

"use strict";
const assert=require("assert");
const bridge=require("../Data/marion/runtime/marionBridge.js");
const guard=require("../Data/marion/runtime/marionCurrentTurnAuthority.js");
(async()=>{
  const base={privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,passwordFreeTestChat:true,isolatedSession:true,lane:"marion_admin",sessionId:"gap-refinement-session"};

  const oldLaw={userText:"Can you review the legal risks in this contract?",assistantReply:"General legal-risk triage.",domain:"law",updatedAt:100};
  const recentTechnical={userText:"Do a surgical autopsy on the JavaScript law-routing file.",assistantReply:"Technical router analysis.",domain:"technical",activeTask:"Repair immediate-turn continuity",surfaceRequest:"Fix Go deeper continuity",deeperIntent:"Preserve the latest accepted technical subject",operationalRisk:"Older law metadata can hijack the follow-up",executionMode:"surgical runtime repair",nextAction:"Lock the router, State Spine, composer, and final envelope",technicalTarget:"marionIntentRouter.js",updatedAt:200,final:true,marionFinal:true};
  const prepared=guard.prepareInput({...base,newSession:false,text:"Go deeper.",previousMemory:{turns:[oldLaw,recentTechnical]}});
  assert.equal(prepared.domain,"technical");
  assert.equal(prepared.continuityAnchor.userText,recentTechnical.userText);
  assert.equal(prepared.previousMemory.surfaceRequest,recentTechnical.surfaceRequest);
  assert.equal(prepared.previousMemory.deeperIntent,recentTechnical.deeperIntent);
  assert.equal(prepared.previousMemory.operationalRisk,recentTechnical.operationalRisk);
  assert.equal(prepared.previousMemory.executionMode,recentTechnical.executionMode);
  assert.equal(prepared.previousMemory.nextAction,recentTechnical.nextAction);
  assert.equal(prepared.previousMemory.technicalTargetLock.targetPath,"marionIntentRouter.js");

  const law=await bridge.processWithMarion({...base,newSession:true,turnId:"g1",text:"Can you review the legal risks in this contract?"});
  assert.equal(law.domain,"law");
  const greeting=await bridge.processWithMarion({...base,newSession:false,turnId:"g2",text:"Good morning, Marion."});
  assert.equal(greeting.domain,"general");
  assert(/good morning|hello|here with you/i.test(guard.replyFrom(greeting)));
  assert(!/legal-risk|not legal advice|jurisdiction sensitivity/i.test(guard.replyFrom(greeting)));

  const fresh=await bridge.processWithMarion({...base,newSession:true,turnId:"g3",text:"Go deeper."});
  assert.equal(fresh.domain,"general");
  assert(/reliable active thread|specific target/i.test(guard.replyFrom(fresh)));
  assert.equal(fresh.meta.semanticHealth,"degraded");
  assert.equal(fresh.meta.semanticFailureSignature,"CONTINUATION_ANCHOR_MISSING");

  const publicInput={text:"Go deeper.",sessionId:"public",previousMemory:{turns:[recentTechnical]}};
  assert.strictEqual(guard.prepareInput(publicInput),publicInput);

  const hostile={toString(){throw new Error("hostile primitive conversion")},valueOf(){throw new Error("hostile valueOf")}};
  assert.doesNotThrow(()=>guard.prepareInput({...base,newSession:true,text:"Good morning, Marion.",meta:{hostile}}));

  console.log(JSON.stringify({ok:true,checks:["latest-turn-wins","layered-fields-preserved","law-to-greeting-exit","fresh-session-isolation","semantic-health","public-nyx-no-op","hostile-object-safe"]},null,2));
})().catch(e=>{console.error(e);process.exit(1)});

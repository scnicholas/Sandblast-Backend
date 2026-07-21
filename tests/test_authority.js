"use strict";
const assert = require("assert");
const g = require("../Data/marion/runtime/marionCurrentTurnAuthority.js");

const base = {
  privateAdminConversation: true,
  marionAdminConversation: true,
  directMarionAdminInterface: true,
  sessionId: "s1",
  turnId: "t1"
};

function result(reply, domain) {
  return { ok:true, final:true, marionFinal:true, reply, domain, routing:{domain}, finalEnvelope:{reply,domain,final:true,marionFinal:true}, payload:{reply} };
}

const technicalInput = {...base, text:"Do a surgical autopsy on the JavaScript law-routing file.", userText:"Do a surgical autopsy on the JavaScript law-routing file."};
const technicalFinal = g.enforceResult(result("Technical analysis of the router, state carry, final envelope, and transport path.", "technical"), technicalInput);
assert.equal(technicalFinal.domain, "technical");
assert.equal(technicalFinal.memoryPatch.continuityAnchor.domain, "technical");
assert(/JavaScript law-routing file/i.test(technicalFinal.memoryPatch.continuityAnchor.userText));

let followInput = {...base, turnId:"t2", text:"Go deeper.", userText:"Go deeper.", previousMemory:technicalFinal.memoryPatch};
let prepared = g.prepareInput(followInput);
assert.equal(prepared.domain, "technical");
assert.equal(prepared.intent, "technical_debug");
assert.equal(prepared.continuationResolved, true);
assert.equal(prepared.continuityAnchor.domain, "technical");
assert(/immediately preceding technical task/i.test(prepared.effectivePrompt));

const badRouter = {ok:true, domain:"law", marionIntent:{intent:"domain_question"}, routing:{domain:"law",knowledgeDomain:"law"}, r18cLawAssessment:{active:true}};
const fixedRouter = g.enforceRouterResult(badRouter, prepared);
assert.equal(fixedRouter.domain, "technical");
assert.equal(fixedRouter.routing.domain, "technical");
assert.equal(fixedRouter.intent, "technical_debug");
assert.equal(fixedRouter.r18cLawAssessment, undefined);

const badFinal = result("I can give general legal-risk triage, not legal advice. Jurisdiction sensitivity applies.", "law");
const fixedFinal = g.enforceResult(badFinal, prepared);
assert.equal(fixedFinal.domain, "technical");
assert(/Going deeper/i.test(fixedFinal.reply));
assert(/technical turn/i.test(fixedFinal.reply));
assert(!/not legal advice/i.test(fixedFinal.reply));

const lawInput = {...base, turnId:"l1", text:"Can you review the legal risks in this contract?", userText:"Can you review the legal risks in this contract?"};
const lawFinal = g.enforceResult(result("I can give general legal-risk triage, not legal advice. I need the jurisdiction and source contract.", "law"), lawInput);
assert.equal(lawFinal.domain, "law");
const lawFollow = g.prepareInput({...base, turnId:"l2", text:"Go deeper.", previousMemory:lawFinal.memoryPatch});
assert.equal(lawFollow.domain, "law");
const lawFollowFinal = g.enforceResult(result("Continuing the legal-risk review with jurisdiction and source-document checks.", "law"), lawFollow);
assert.equal(lawFollowFinal.domain, "law");

const isolated = g.prepareInput({...base, turnId:"x1", text:"Go deeper.", newSession:true, isolatedSession:true, previousMemory:lawFinal.memoryPatch});
assert.equal(isolated.domain, "general");
assert.equal(isolated.continuityResolved, false);
const isolatedFinal = g.enforceResult(badFinal, isolated);
assert(/don['’]t have a reliable active thread/i.test(isolatedFinal.reply));
assert(!/legal-risk/i.test(isolatedFinal.reply));

const publicInput = {text:"Go deeper.", previousMemory:technicalFinal.memoryPatch, sessionId:"public"};
assert.strictEqual(g.prepareInput(publicInput), publicInput);
const publicResult = result("public unchanged", "general");
assert.strictEqual(g.enforceResult(publicResult, publicInput), publicResult);

let mem = technicalFinal.memoryPatch;
for (let i=0;i<15;i++) {
  const p = g.prepareInput({...base, turnId:`d${i}`, text:i%2?"Continue.":"Go deeper.", previousMemory:mem});
  assert.equal(p.domain, "technical");
  const f = g.enforceResult(result("Technical runtime analysis continues through router, state, composer, and final envelope.", "technical"), p);
  assert.equal(f.domain, "technical");
  assert.equal(f.memoryPatch.continuityAnchor.domain, "technical");
  mem = f.memoryPatch;
}
assert(mem.continuityAnchor.followupDepth >= 15);

console.log(JSON.stringify({ok:true, version:g.VERSION, tests:9, followupDepth:mem.continuityAnchor.followupDepth}, null, 2));

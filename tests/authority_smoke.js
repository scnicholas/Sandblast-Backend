"use strict";
const assert=require("assert");
const g=require("../Data/marion/runtime/marionCurrentTurnAuthority.js");

function privateInput(text, previousMemory={}, extra={}){
  return {text,prompt:text,userText:text,sessionId:"s1",turnId:"t_"+Math.random().toString(36).slice(2),privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,passwordFreeTestChat:true,previousMemory,...extra};
}
function wrongLawReply(){return {ok:true,reply:"I can give general legal-risk triage, not legal advice. Jurisdiction sensitivity applies.",final:true,marionFinal:true};}
function technicalReply(text){return {ok:true,reply:text,final:true,marionFinal:true,domain:"technical"};}
function runTurn(text, memory, rawResult){
  const input=privateInput(text,memory);
  const prepared=g.prepareInput(input);
  const out=g.enforceResult(rawResult,prepared);
  return {input:prepared,out,memory:out.memoryPatch||{}};
}

assert.equal(g.VERSION,"nyx.marion.currentTurnAuthority/4.0-long-thread-progression");
for(const [p,k] of [
  ["Go deeper.","depth"],
  ["What should be fixed first?","priority"],
  ["Why is that the first priority?","reason"],
  ["What could break if we fix it incorrectly?","failure"],
  ["What is the safest implementation order?","order"],
  ["How do we validate that?","validation"],
  ["What is the main risk?","pressure"],
  ["What happens after that?","after"]
]) assert.equal(g.followupKind(p),k,p);

let memory={};
let r=runTurn("Do a surgical autopsy on the JavaScript law-routing file.",memory,technicalReply("The first defect is router precedence: current text must be classified before remembered law metadata is merged."));
memory=r.memory;
assert.equal(r.out.domain,"technical");
assert.ok(memory.continuityAnchor);
assert.equal(memory.continuityAnchor.domain,"technical");

const chain=[
  "Go deeper.",
  "What should be fixed first?",
  "Why is that the first priority?",
  "What could break if we fix it incorrectly?",
  "What is the safest implementation order?",
  "How do we validate that?",
  "What is the main risk?",
  "What happens after that?"
];
const replies=[];
for(const p of chain){
  r=runTurn(p,memory,wrongLawReply());
  memory=r.memory;
  replies.push(r.out.reply);
  assert.equal(r.out.domain,"technical",p);
  assert.equal(r.out.primaryDomain,"technical",p);
  assert.ok(!/legal-risk|not legal advice|jurisdiction sensitivity/i.test(r.out.reply),p+" leaked law");
  assert.ok(/router|routing|technical|state|domain|validation|implementation|regression|authority|classification/i.test(r.out.reply),p+" not substantive technical");
  assert.equal(memory.continuityAnchor.domain,"technical",p);
  assert.ok(memory.continuityAnchor.followupDepth>=1,p);
}
assert.equal(new Set(replies).size,replies.length,"follow-up replies repeated");

// Explicit greeting exits the technical lane.
r=runTurn("Good afternoon, Marion.",memory,wrongLawReply());
assert.equal(r.out.domain,"general");
assert.ok(/good afternoon|hello|here/i.test(r.out.reply));
assert.ok(!/legal-risk|router precedence/i.test(r.out.reply));

// Explicit law anchor and long legal follow-ups remain law.
memory={};
r=runTurn("Can you review the legal risks in this contract?",memory,{ok:true,reply:"This is general legal information. Start with the governing jurisdiction and contract terms.",final:true,marionFinal:true,domain:"law"});
memory=r.memory;
assert.equal(r.out.domain,"law");
for(const p of ["Go deeper.","What should be fixed first?","Why is that the first priority?","What is the safest implementation order?"]){
  r=runTurn(p,memory,technicalReply("Inspect the JavaScript router."));
  memory=r.memory;
  assert.equal(r.out.domain,"law",p);
  assert.ok(/legal|jurisdiction|clause|agreement|breach|remed|counsel/i.test(r.out.reply),p);
  assert.ok(!/javascript router/i.test(r.out.reply),p);
}

// Fresh session cannot inherit old anchor.
const fresh=privateInput("Next.",memory,{newSession:true,firstTurn:true});
const freshOut=g.enforceResult(wrongLawReply(),g.prepareInput(fresh));
assert.equal(freshOut.domain,"general");
assert.ok(/substantive topic|tell me what/i.test(freshOut.reply));

// Public Nyx is strict no-op.
const publicInput={text:"What is the safest implementation order?",lane:"public",surfaceAgent:"nyx"};
const publicResult={reply:"Nyx public reply",domain:"general"};
assert.deepStrictEqual(g.enforceResult(publicResult,publicInput),publicResult);

console.log(JSON.stringify({ok:true,version:g.VERSION,contract:g.CONTINUITY_CONTRACT,technicalTurns:chain.length,uniqueReplies:new Set(replies).size},null,2));

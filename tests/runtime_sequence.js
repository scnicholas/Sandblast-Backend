"use strict";
const assert=require('assert');
const adapter=require('../Data/marion/runtime/marionPrivateRuntimeAdapter.js');
function replyOf(r){return r&&(r.reply||r.finalReply||r.visibleReply||r.text||r.message)||''}
(async()=>{
 const sessionId='cert-seq';
 const prompts=[
  'Hello Marion.',
  'Do a surgical autopsy on the JavaScript law-routing file.',
  'Go deeper.',
  'What should be fixed first?',
  'Why is that the first priority?',
  'What could break if it is repaired incorrectly?',
  'What is the safest implementation order?',
  'How do we validate the repair?',
  'What happens after that?',
  'Can you review the legal risks in this contract?',
  'What should I examine first?',
  'Good evening, Marion.'
 ];
 const rows=[];
 for(let i=0;i<prompts.length;i++){
  const prompt=prompts[i];
  const r=await adapter.invokePrivateRuntime({prompt,sessionId,conversationId:sessionId,turnId:'turn-'+(i+1),newSession:i===0,firstTurn:i===0,isolatedSession:true,passwordFreeTestChat:true},{adminVerified:true,sessionVerified:true,sessionId});
  const reply=replyOf(r);
  rows.push({i:i+1,prompt,ok:r.ok,statusCode:r.statusCode,stage:r.stage,reply,context:r.privateRuntimeContext,domain:r.result&&(r.result.domain||r.result.knowledgeDomain||(r.result.routing&&r.result.routing.domain)||(r.result.finalEnvelope&&r.result.finalEnvelope.domain))});
  assert.strictEqual(r.ok,true,`turn ${i+1} failed: ${JSON.stringify(r)}`);
  assert(reply,`turn ${i+1} missing reply`);
  if(i>=1&&i<=8){assert(!/not legal advice|governing jurisdiction|general legal/i.test(reply),`technical turn ${i+1} leaked legal fallback: ${reply}`);}
  if(i===9){assert(/legal|contract|jurisdiction|agreement/i.test(reply),`legal turn not legal: ${reply}`);}
  if(i===10){assert(/governing-law|scope|liability|agreement/i.test(reply),`legal follow-up drifted: ${reply}`);}
  if(i===11){assert(/hello|here/i.test(reply)&&!/legal|javascript|routing|ai adaptability|cyber/i.test(reply),`social lane exit failed: ${reply}`);}
 }
 // Fresh session must not inherit.
 const fresh=await adapter.invokePrivateRuntime({prompt:'How do we validate the repair?',sessionId:'fresh-seq',conversationId:'fresh-seq',turnId:'fresh-1',newSession:true,firstTurn:true,isolatedSession:true,passwordFreeTestChat:true},{adminVerified:true,sessionVerified:true,sessionId:'fresh-seq'});
 rows.push({i:'fresh',prompt:'How do we validate the repair?',ok:fresh.ok,statusCode:fresh.statusCode,stage:fresh.stage,reply:replyOf(fresh),context:fresh.privateRuntimeContext});
 assert.strictEqual(fresh.ok,true);
 assert(/isn.t a substantive topic|no substantive topic|tell me what you want/i.test(replyOf(fresh)),`fresh session did not clarify: ${replyOf(fresh)}`);
 assert(!/four passes: a fresh-session technical anchor|ai adaptability|cyber protection|governing-law/i.test(replyOf(fresh)),`fresh session inherited prior lane: ${replyOf(fresh)}`);
 console.log(JSON.stringify({ok:true,adapterStatus:adapter.getStatus(),rows},null,2));
})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});

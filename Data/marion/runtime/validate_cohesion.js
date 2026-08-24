"use strict";
const router=require("./marionIntentRouter.js");
const bridge=require("./marionBridge.js");
const envelope=require("./marionFinalEnvelope.js");

function assert(cond,msg){if(!cond)throw new Error(msg)}
async function main(){
  const routeCases=[
    ["What is artificial intelligence?","ai"],
    ["What is grammar?","english"],
    ["What is zero trust?","cyber"],
    ["What is contract law?","law"],
    ["What is cash flow?","finance"],
    ["What is cognitive bias?","psychology"]
  ];
  for(const [q,d] of routeCases){
    const r=router.buildPublicKnowledgeFastRoute({text:q,audience:"public",surfaceAgent:"nyx",publicSurfaceOnly:true});
    assert(r&&r.routing&&r.routing.domain===d,`route failed: ${q}`);
    assert(r.singlePassRequired===true||r.routing.singlePassRequired===true,`single pass missing: ${q}`);
  }
  assert(!router.buildPublicKnowledgeFastRoute({text:"What is artificial intelligence?",audience:"owner",scope:"private_admin",privateAdminConversation:true}),"private turn entered public fast route");

  const e=envelope.createMarionFinalEnvelope({singlePassPublicKnowledge:true,reply:"Artificial intelligence is a field of systems that learn patterns, reason, and generate useful outputs.",prompt:"What is artificial intelligence?",userText:"What is artificial intelligence?",rawUserText:"What is artificial intelligence?",turnId:"t1",sessionId:"s1",routing:{domain:"ai",knowledgeDomain:"ai",intent:"domain_question",domainConfidence:{confidence:.995}},sixDomainCoverage:[{domain:"ai",accessible:true}],meta:{singlePassPublicKnowledge:true}});
  assert(e.final===true&&e.marionFinal===true&&e.canEmit===true,"fast envelope failed");
  assert(e.publicAgent==="Nyx"&&e.finalEnvelope&&e.finalEnvelope.source==="marion","Nyx/Marion authority split failed");

  const t=Date.now();
  const b=await bridge.processWithMarion({text:"What is artificial intelligence?",message:"What is artificial intelligence?",sessionId:"test_s",turnId:"test_t",audience:"public",surfaceAgent:"nyx",publicSurfaceOnly:true,requireMarionFinal:true,marionRequired:true,singlePassPreferred:true});
  const wallMs=Date.now()-t;
  assert(b.final===true&&b.marionFinal===true,"bridge did not return Marion final");
  assert(b.marionRoute==="marion-primary","bridge route not primary");
  assert(/Artificial intelligence is the field of building systems/i.test(b.reply||""),"AI semantic answer missing");
  assert(b.meta&&b.meta.marionTiming&&Number.isFinite(b.meta.marionTiming.totalMs),"timing metadata missing");

  return {ok:true,assertions:routeCases.length*2+1+2+4,ai:{wallMs,reply:b.reply,route:b.marionRoute,marionFinal:b.marionFinal,timing:b.meta.marionTiming}};
}
main().then(x=>{console.log(JSON.stringify(x,null,2))}).catch(e=>{console.error(e.stack||e);process.exit(1)});

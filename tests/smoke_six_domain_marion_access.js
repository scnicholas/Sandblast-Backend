"use strict";
const bridge=require("./marionBridge.js");
const prompts=[
  "Tell me about cognitive",
  "Tell me about cognitive bias",
  "Tell me about auditing",
  "What is least privilege?",
  "Explain phishing",
  "What is syntax?",
  "Tell me about machine learning",
  "Explain emotional regulation",
  "What is revenue?",
  "What is consideration in contract law?"
];
function replyOf(out){
  return String(out.reply||out.text||out.answer||(out.finalEnvelope&&out.finalEnvelope.reply)||(out.payload&&out.payload.reply)||"").trim();
}
function badReply(s){
  return !s || /progression active|run next validation|passed or failed|which file or runtime layer|are you asking about the interface|backend technical work|radio\/media|are you aiming this at interface buyers/i.test(s);
}
(async()=>{
  for(const q of prompts){
    const out=await bridge.processWithMarion({
      message:q,text:q,userQuery:q,inputSource:"text",lane:"general",
      requireMarionFinal:true,publicDomainAccess:true,
      domainAccess:["english","psychology","ai","finance","cyber","law"],
      ui:{publicSurfaceOnly:true,finalEnvelope:true,domainAccess:true}
    });
    const reply=replyOf(out);
    if(badReply(reply)){
      console.error("FAILED:", q, "=>", reply);
      process.exit(1);
    }
    console.log("PASS:", q, "=>", reply.slice(0,120));
  }
})();

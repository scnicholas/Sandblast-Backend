
"use strict";
const assert=require("assert");
const router=require("../Data/marion/runtime/marionIntentRouter.js");
const common={route:"/api/private/marion/admin/runtime",path:"/api/private/marion/admin/runtime",privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,adminVerified:true,passwordFreeTestChat:true,sessionId:"router-v6",conversationId:"router-v6"};
const prompts=[
 "Do a surgical autopsy on the JavaScript law-routing file.",
 "Go deeper.",
 "What should be fixed first?",
 "Why is that the first priority?",
 "What could break if it is repaired incorrectly?",
 "What is the safest implementation order?",
 "How do we validate the repair?",
 "What happens after that?"
];
const domains=[];
for(let i=0;i<prompts.length;i++){
 const q=prompts[i];
 const out=router.routeMarionIntent({...common,turnId:String(i+1),newSession:i===0,firstTurn:i===0,prompt:q,rawUserText:q,userText:q,text:q,message:q});
 const d=String(out.domain||out.primaryDomain||out.knowledgeDomain||out.routing&&out.routing.domain||out.routing&&out.routing.knowledgeDomain||"");
 domains.push(d);
 assert.strictEqual(d,"technical",`${q} => ${d}`);
}
const legal="Can you review the legal risks in this contract?";
const law=router.routeMarionIntent({...common,turnId:"9",prompt:legal,rawUserText:legal,userText:legal,text:legal,message:legal});
const ld=String(law.domain||law.primaryDomain||law.knowledgeDomain||law.routing&&law.routing.domain||law.routing&&law.routing.knowledgeDomain||"");
assert.strictEqual(ld,"law");
console.log(JSON.stringify({ok:true,domains,legalDomain:ld}));

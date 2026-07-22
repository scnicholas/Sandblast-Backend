
"use strict";
const assert=require("assert");
const chat=require("../Utils/chatEngine.js");
const router=require("../Data/marion/runtime/marionIntentRouter.js");
assert(chat && typeof chat==="object");
assert(router && typeof router.routeMarionIntent==="function");
for(const n of ["safeResponse","buildResponse","createResponse","finalizeTurn"]) assert.strictEqual(typeof chat[n],"function",n);
const base={route:"/api/private/marion/admin/runtime",privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,adminVerified:true,sessionId:"s1",conversationId:"s1",activeTask:"JavaScript routing repair",domain:"technical",primaryDomain:"technical",prompt:"How do we validate the repair?",rawUserText:"How do we validate the repair?",userText:"How do we validate the repair?",text:"How do we validate the repair?",message:"How do we validate the repair?"};
const tech=router.routeMarionIntent(base);
assert.strictEqual(String(tech.domain||tech.primaryDomain||tech.routing&&tech.routing.domain),"technical");
const law=router.routeMarionIntent({...base,domain:"",primaryDomain:"",activeTask:"",prompt:"Can you review the legal risks in this contract?",rawUserText:"Can you review the legal risks in this contract?",userText:"Can you review the legal risks in this contract?",text:"Can you review the legal risks in this contract?",message:"Can you review the legal risks in this contract?"});
const lawDomain=String(law.domain||law.primaryDomain||law.knowledgeDomain||law.routing&&law.routing.domain||law.routing&&law.routing.knowledgeDomain||"");
assert(lawDomain==="law"||String(law.routing&&law.routing.knowledgeDomain)==="law",JSON.stringify(law).slice(0,500));
console.log(JSON.stringify({ok:true,chatVersion:chat.VERSION,routerVersion:router.VERSION,techDomain:tech.domain||tech.primaryDomain,lawDomain}));

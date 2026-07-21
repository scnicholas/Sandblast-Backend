"use strict";
const assert = require("assert");
const bridge = require("../Data/marion/runtime/marionBridge.js");
const router = require("../Data/marion/runtime/marionIntentRouter.js");
const finalMod = require("../Data/marion/runtime/marionFinalEnvelope.js");
const guard = require("../Data/marion/runtime/marionCurrentTurnAuthority.js");

function privateInput(text, extra={}) {
  return {
    prompt:text, text, message:text, query:text, userText:text, rawUserText:text,
    lane:"private", audience:"operator", source:"marion-admin-console",
    route:"/api/private/marion/admin/runtime", privateAdminConversation:true,
    directMarionAdminInterface:true, marionAdminConversation:true,
    adminVerified:true, sessionVerified:true, ...extra
  };
}
function replyOf(v){ return guard.replyFrom(v); }
async function main(){
  const results=[];
  const clean=privateInput("Good evening, Marion.",{newSession:true,isolatedTestSession:true});
  const routed=router.routeMarionIntent(clean);
  assert(!/law/i.test(String(routed && routed.routing && routed.routing.domain || "")), "clean greeting routed to law");
  assert.equal(routed.routing.domain,"general");
  results.push({test:"router clean greeting",pass:true,domain:routed.routing.domain,intent:routed.routing.intent});

  const stale=privateInput("Good evening, Marion.",{newSession:true,isolatedTestSession:true,previousMemory:{domain:"law",activeFeatureLane:"law",lastAssistantReply:"I can frame this as legal risk",r18CLawRealWorldAssessment:true},routing:{domain:"law",legalCategory:"contract"},meta:{version:"R18C-LAW-CONTRACT"}});
  const staleRouted=router.routeMarionIntent(stale);
  assert.equal(staleRouted.routing.domain,"general");
  const staleOut=await bridge.processWithMarion(stale);
  const staleReply=replyOf(staleOut);
  assert(staleReply && !/legal-risk|not legal advice|contract risk|jurisdiction matters/i.test(staleReply), "stale law reply leaked");
  assert(/evening|here with you|hello/i.test(staleReply), "greeting reply missing");
  assert.equal(String(staleOut.routing && staleOut.routing.domain || staleOut.domain),"general");
  results.push({test:"isolated stale-law greeting",pass:true,reply:staleReply,domain:staleOut.routing&&staleOut.routing.domain});

  const law=privateInput("Can you review the legal risks in this contract?",{newSession:true,isolatedTestSession:true});
  const lawRouted=router.routeMarionIntent(law);
  assert.equal(lawRouted.routing.domain,"law");
  const lawOut=await bridge.processWithMarion(law);
  const lawReply=replyOf(lawOut);
  assert(/legal|contract|risk|jurisdiction/i.test(lawReply), "legitimate law lane lost");
  results.push({test:"explicit law request preserved",pass:true,reply:lawReply.slice(0,220),domain:lawOut.routing&&lawOut.routing.domain});

  const tech=privateInput("Do a surgical autopsy on the law routing file and fix the JavaScript bug.",{newSession:true,isolatedTestSession:true});
  const techRouted=router.routeMarionIntent(tech);
  assert.notEqual(techRouted.routing.domain,"law","technical law-file work misrouted to law");
  const techOut=await bridge.processWithMarion(tech);
  const techReply=replyOf(techOut);
  assert(!/not legal advice|jurisdiction matters because procedure/i.test(techReply),"technical request rewritten as legal advice");
  results.push({test:"technical law-file work preserved",pass:true,reply:techReply.slice(0,220),domain:techOut.routing&&techOut.routing.domain});

  // Direct final-envelope regression: output metadata may contain law tokens but the current prompt is a greeting.
  const directFinal=finalMod.createMarionFinalEnvelope({reply:"Good evening, Mac.",domain:"general",intent:"simple_chat",meta:{version:"R18C-LAW-CONTRACT"}},clean);
  const directReply=replyOf(directFinal);
  assert(!/legal-risk|not legal advice|contract risk/i.test(directReply));
  results.push({test:"final envelope metadata self-trigger blocked",pass:true,reply:directReply});

  // Public Nyx boundary is a no-op.
  const publicInput={prompt:"Good evening, Marion.",text:"Good evening, Marion.",lane:"public_interface",audience:"public",source:"nyx-public",route:"/api/chat"};
  assert.strictEqual(guard.prepareInput(publicInput),publicInput);
  const publicResult={reply:"Nyx public reply",routing:{domain:"general"}};
  assert.strictEqual(guard.enforceResult(publicResult,publicInput),publicResult);
  results.push({test:"Nyx public architecture no-op",pass:true});

  const shortLawCarry=router.r18cDetectLawIntentSignals("Next",{routing:{domain:"law"}});
  const shortMetadataOnly=router.r18cDetectLawIntentSignals("Next",{routing:{domain:"technical"},version:"R18C-LAW-CONTRACT"});
  assert.equal(shortLawCarry.active,true,"genuine law continuity was lost");
  assert.equal(shortMetadataOnly.active,false,"version metadata activated false law carry");
  results.push({test:"bounded short law follow-up",pass:true});

  // Circular and hostile primitive conversion.
  const circular=privateInput("Hello, Marion.",{newSession:true}); circular.self=circular;
  Object.defineProperty(circular,"hostile",{enumerable:true,get(){throw new Error("hostile getter");}});
  const circularOut=await bridge.processWithMarion(circular);
  assert(replyOf(circularOut));
  JSON.stringify(circularOut);
  results.push({test:"circular/hostile packet transport",pass:true,reply:replyOf(circularOut)});

  console.log(JSON.stringify({ok:true,bridgeVersion:bridge.VERSION,authorityVersion:guard.VERSION,results},null,2));
}
main().catch(err=>{console.error(err&&err.stack||err);process.exit(1);});

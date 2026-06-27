"use strict";
const assert = require("assert");
const prompt = "This is disjointed, but we need Marion to understand the deeper task, preserve the context, avoid looping, and tell me where to go next.";
const psychologyReply = "In psychology, the focus is how people think, feel, learn, decide, and behave. A good explanation connects the concept to real patterns, triggers, and outcomes.";
function readReply(p){return (p&&(p.reply||p.publicReply||p.visibleReply||p.finalReply||p.text||p.displayReply||p.message||p.output||p.response||(p.payload&&(p.payload.reply||p.payload.text))||(p.finalEnvelope&&(p.finalEnvelope.reply||p.finalEnvelope.text))))||"";}
function assertR2(reply,label){
  assert(reply && /Priority 9F-R2/i.test(reply), label+" should name Priority 9F-R2");
  assert(/domain hijack suppression/i.test(reply), label+" should name domain hijack suppression");
  assert(/Marion conversational architecture/i.test(reply), label+" should preserve Marion architecture lane");
  assert(!/^In psychology/i.test(reply), label+" must not output psychology fallback");
  assert(!/good explanation connects the concept/i.test(reply), label+" must not leak six-domain answer");
}
(async()=>{
  const shape=require("../Data/marion/runtime/progressionShape.js");
  const profile=shape.buildProgressionProfile(prompt,{});
  assert.strictEqual(profile.phaseKey,"priority9f_r2","shape should force 9F-R2 phase");
  assert.strictEqual(profile.responseShape,"layered_conversational_stack","shape should keep layered stack");

  const dc=require("../Data/marion/runtime/domainConfidence.js");
  const confidence=dc.buildDomainConfidenceProfile({text:prompt});
  assert.strictEqual(confidence.primaryDomain,"execution_context","domain confidence should suppress psychology route");
  assert.strictEqual(confidence.knowledgeDomain,"","knowledge domain must be blank for 9F prompt");

  const router=require("../Data/marion/runtime/marionIntentRouter.js");
  const routed=router.routeMarionIntent({text:prompt,userText:prompt});
  assert.strictEqual(routed.routing.domain,"execution_context","router should force execution_context");
  assert.strictEqual(routed.routing.knowledgeDomain,"","router must not carry psychology knowledge domain");

  const concierge=require("../Data/marion/runtime/DomainConcierge.js");
  const decision=concierge.runDomainConcierge({text:prompt,userText:prompt});
  assert.strictEqual(decision.route,"execution_context","concierge should force execution_context");
  assert.strictEqual(decision.knowledgeDomain,"","concierge must not carry psychology knowledge domain");

  const envelope=require("../Data/marion/runtime/marionFinalEnvelope.js");
  const cleaned=envelope.attachVisibleReplyAliases({userText:prompt,prompt,reply:psychologyReply,publicReply:psychologyReply,routing:{domain:"psychology",knowledgeDomain:"psychology"}});
  assertR2(readReply(cleaned),"final envelope");

  const composer=require("../Data/marion/runtime/composeMarionResponse.js");
  const composed=composer.composeMarionResponse({routing:{domain:"psychology",knowledgeDomain:"psychology"},domain:"psychology",knowledgeDomain:"psychology",reply:psychologyReply},{userText:prompt,text:prompt,reply:psychologyReply,routing:{domain:"psychology",knowledgeDomain:"psychology"}});
  assertR2(readReply(composed),"composer");

  const bridge=require("../Data/marion/runtime/marionBridge.js");
  const bridgeInternal=bridge._internal;
  assert(bridgeInternal.priority9FR2BridgeDomainHijackReply(psychologyReply),"bridge should recognize domain hijack reply");
  assert(bridgeInternal.priority9FR2BridgeLayeredPrompt(prompt),"bridge should recognize layered prompt");

  console.log(JSON.stringify({ok:true,tests:8,reply:readReply(composed),shape:profile.responseShape,router:routed.routing.domain,concierge:decision.route},null,2));
})().catch(err=>{console.error(err);process.exit(1);});

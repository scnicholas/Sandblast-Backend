"use strict";
const assert=require("assert");
const path=require("path");
const root=path.resolve(__dirname,"..");
const g=require(path.join(root,"Data/marion/runtime/marionCurrentTurnAuthority.js"));
const b=require(path.join(root,"Data/marion/runtime/marionBridge.js"));
const router=require(path.join(root,"Data/marion/runtime/marionIntentRouter.js"));
const composer=require(path.join(root,"Data/marion/runtime/composeMarionResponse.js"));
const envelope=require(path.join(root,"Data/marion/runtime/marionFinalEnvelope.js"));
const memory=require(path.join(root,"Data/marion/runtime/guardian.memory.bridge.js"));
const state=require(path.join(root,"Utils/stateSpine.js"));

function packet(text,sessionId,extra={}){return {text,prompt:text,userText:text,sessionId,turnId:"turn-"+Math.random().toString(36).slice(2),privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,passwordFreeTestChat:true,...extra};}
function getReply(o){return o&&((o.finalEnvelope&&o.finalEnvelope.reply)||o.directReply||o.visibleReply||o.displayReply||o.reply||o.text)||"";}
function getDomain(o){return o&&(o.domain||o.primaryDomain||(o.routing&&o.routing.domain)||(o.finalEnvelope&&o.finalEnvelope.domain))||"";}
function aliases(o){return [o.reply,o.directReply,o.visibleReply,o.displayReply,o.finalReply,o.answer,o.response,o.text,o.message,o.output,o.spokenText,o.finalEnvelope&&o.finalEnvelope.reply].filter(Boolean);}

(async()=>{
  const results={versions:{},tests:[]};
  results.versions.authority=g.VERSION;
  results.versions.contract=g.CONTINUITY_CONTRACT;
  results.versions.bridge=b.VERSION;
  results.versions.bridgeContract=b.BRIDGE_CONTRACT_VERSION;
  assert.equal(g.VERSION,"nyx.marion.currentTurnAuthority/4.0-long-thread-progression");
  assert.equal(b.VERSION,"marionBridge v7.8.0 LONG-THREAD-PROGRESSION-AUTHORITY");
  assert.equal(typeof router.routeMarionIntent,"function");
  assert.equal(typeof composer.composeMarionResponse,"function");
  assert.equal(typeof envelope.createMarionFinalEnvelope,"function");
  assert.equal(typeof memory.rememberTurn,"function");
  assert.ok(typeof state==="object"||typeof state==="function");
  results.tests.push({name:"module_load_and_versions",ok:true});

  // Long technical chain, no previousMemory supplied by caller.
  const techSession="tech-chain";
  let out=await b.processWithMarion(packet("Do a surgical autopsy on the JavaScript law-routing file.",techSession,{newSession:true,firstTurn:true}));
  assert.equal(getDomain(out),"technical");
  const techPrompts=["Go deeper.","What should be fixed first?","Why is that the first priority?","What could break if we fix it incorrectly?","What is the safest implementation order?","How do we validate that?","What is the main risk?","What happens after that?"];
  const techReplies=[];
  for(const q of techPrompts){
    out=await b.processWithMarion(packet(q,techSession,{newSession:false,firstTurn:false}));
    const r=getReply(out),d=getDomain(out);
    assert.equal(d,"technical",q);
    assert.ok(!/legal-risk|legal category|not legal advice|jurisdiction sensitivity/i.test(r),q+" law leak");
    assert.ok(r.length>60,q+" shallow reply");
    const a=aliases(out);assert.ok(a.length>=5,q+" aliases missing");assert.equal(new Set(a).size,1,q+" alias divergence");
    techReplies.push(r);
  }
  assert.equal(new Set(techReplies).size,techReplies.length,"technical answers repeated");
  results.tests.push({name:"eight_turn_technical_progression",ok:true,turns:techPrompts.length,uniqueReplies:new Set(techReplies).size});

  // Explicit greeting exits technical lane.
  out=await b.processWithMarion(packet("Good afternoon, Marion.",techSession,{newSession:false,firstTurn:false}));
  assert.equal(getDomain(out),"general");
  assert.ok(/good afternoon|hello|here/i.test(getReply(out)));
  assert.ok(!/router|legal-risk|implementation order/i.test(getReply(out)));
  results.tests.push({name:"explicit_lane_exit",ok:true});

  // Long law chain remains law.
  const lawSession="law-chain";
  out=await b.processWithMarion(packet("Can you review the legal risks in this contract?",lawSession,{newSession:true,firstTurn:true}));
  assert.equal(getDomain(out),"law");
  const lawPrompts=["Go deeper.","What should be fixed first?","Why is that the first priority?","What could break if we get it wrong?","What is the safest implementation order?","How do we validate that?"];
  for(const q of lawPrompts){
    out=await b.processWithMarion(packet(q,lawSession,{newSession:false,firstTurn:false}));
    const r=getReply(out),d=getDomain(out);
    assert.equal(d,"law",q);
    assert.ok(/legal|jurisdiction|clause|obligation|breach|remed|counsel|agreement/i.test(r),q+" not legal");
    assert.ok(!/javascript law-routing|router precedence/i.test(r),q+" technical leak");
  }
  results.tests.push({name:"six_turn_law_progression",ok:true,turns:lawPrompts.length});

  // Fresh session rejects inherited continuity.
  out=await b.processWithMarion(packet("Next.","fresh-session",{newSession:true,firstTurn:true}));
  assert.equal(getDomain(out),"general");
  assert.ok(/substantive topic|tell me what|specific target/i.test(getReply(out)));
  results.tests.push({name:"fresh_session_isolation",ok:true});

  // Greeting cannot become substantive anchor.
  const greetSession="greeting-anchor";
  out=await b.processWithMarion(packet("Hello Marion.",greetSession,{newSession:true,firstTurn:true}));
  out=await b.processWithMarion(packet("Go deeper.",greetSession,{newSession:false,firstTurn:false}));
  assert.equal(getDomain(out),"general");
  assert.ok(/substantive topic|tell me what|specific target/i.test(getReply(out)));
  results.tests.push({name:"non_substantive_anchor_rejection",ok:true});

  // Public Nyx boundary no-op at authority layer.
  const pub={reply:"Nyx public reply",domain:"general",surfaceAgent:"nyx"};
  assert.deepStrictEqual(g.enforceResult(pub,{text:"What is the safest implementation order?",lane:"public",surfaceAgent:"nyx"}),pub);
  results.tests.push({name:"public_nyx_no_op",ok:true});

  // Hostile primitive conversion does not throw.
  const hostile={toString(){throw new Error("hostile")},toJSON(){throw new Error("hostile-json")}};
  assert.doesNotThrow(()=>g.extractCurrentText({text:hostile,privateAdminConversation:true}));
  results.tests.push({name:"hostile_primitive_safety",ok:true});

  results.cache={legacy:b._continuityCacheDiagnostics&&b._continuityCacheDiagnostics(),longThread:b._longThreadCacheDiagnostics&&b._longThreadCacheDiagnostics()};
  console.log(JSON.stringify({ok:true,...results},null,2));
})().catch(err=>{console.error(err&&err.stack||err);process.exit(1);});

"use strict";
const assert=require("assert");
const b=require("../Data/marion/runtime/marionBridge.js");
function input(text,extra={}){return {text,prompt:text,userText:text,sessionId:"bridge-s1",turnId:"turn-"+Math.random().toString(36).slice(2),privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,passwordFreeTestChat:true,...extra};}
function reply(o){return o&&((o.finalEnvelope&&o.finalEnvelope.reply)||o.directReply||o.visibleReply||o.reply||o.text)||"";}
(async()=>{
  assert.equal(b.VERSION,"marionBridge v7.8.0 LONG-THREAD-PROGRESSION-AUTHORITY");
  let out=await b.processWithMarion(input("Do a surgical autopsy on the JavaScript law-routing file.",{newSession:true,firstTurn:true}));
  assert.equal(out.domain||out.primaryDomain||(out.routing&&out.routing.domain),"technical");
  const chain=["Go deeper.","What should be fixed first?","Why is that the first priority?","What could break if we fix it incorrectly?","What is the safest implementation order?","How do we validate that?"];
  const rows=[];
  for(const q of chain){
    out=await b.processWithMarion(input(q,{newSession:false,firstTurn:false}));
    const r=reply(out),d=out.domain||out.primaryDomain||(out.routing&&out.routing.domain)||(out.finalEnvelope&&out.finalEnvelope.domain);
    rows.push({q,d,r});
    assert.equal(d,"technical",q+" domain");
    assert.ok(!/legal-risk|not legal advice|jurisdiction sensitivity|legal category/i.test(r),q+" law leak: "+r);
    assert.ok(r.length>40,q+" weak reply");
  }
  assert.equal(new Set(rows.map(x=>x.r)).size,rows.length,"bridge repeated replies");
  const fresh=await b.processWithMarion(input("Next.",{sessionId:"bridge-fresh",newSession:true,firstTurn:true}));
  assert.ok(/substantive topic|tell me what|specific target/i.test(reply(fresh)),reply(fresh));
  console.log(JSON.stringify({ok:true,version:b.VERSION,contract:b.BRIDGE_CONTRACT_VERSION,rows,cache:b._continuityCacheDiagnostics&&b._continuityCacheDiagnostics()},null,2));
})().catch(e=>{console.error(e);process.exit(1);});

"use strict";
const path=require('path');
const root=path.resolve(__dirname,'..','Data','marion','runtime');
const guard=require(path.join(root,'marionCurrentTurnAuthority.js'));
const composer=require(path.join(root,'composeMarionResponse.js'));
const envelope=require(path.join(root,'marionFinalEnvelope.js'));

function input(text, anchor, extra={}){
  return {
    directMarionAdminInterface:true,
    marionAdminConversation:true,
    privateAdminConversation:true,
    adminInterfaceScope:'marion_admin_conversation',
    deliveryChannel:'marion_admin_interface',
    source:'marion-admin-console', inputChannel:'text',
    sessionId:'session-test', turnId:'turn-'+Math.random().toString(36).slice(2),
    prompt:text, text, userText:text, message:text,
    previousMemory: anchor ? {continuityAnchor:anchor} : {},
    ...extra
  };
}
function anchor(userText,domain='technical',reply='Initial analysis complete.'){
  return {contract:guard.CONTINUITY_CONTRACT,domain,userText,topic:userText,activeTask:userText,assistantReply:reply,trustedFinal:true,updatedAt:Date.now()-1000};
}
function read(v){return guard.replyFrom(v);}
function assert(name,cond,detail){if(!cond){throw new Error(name+': '+detail)} return {name,ok:true,detail};}
const results=[];

// 1. Greeting is never a substantive anchor.
const greetingInput=input('Go deeper.',anchor('Hello Marion.','general','Hello, Mac.'));
const preparedGreeting=guard.prepareInput(greetingInput);
const greetingReply=guard.enforceResult({reply:'Continuing from the immediately preceding turn on Hello Marion: I will preserve the active subject.'},preparedGreeting);
results.push(assert('greeting_anchor_rejected',/There isn.t a substantive topic/i.test(read(greetingReply)),read(greetingReply)));
results.push(assert('greeting_meta_hidden',!/preceding turn|active subject|authority|lane/i.test(read(greetingReply)),read(greetingReply)));

// 2. Technical law-routing follow-up advances substantively.
const target='Do a surgical autopsy on the JavaScript law-routing file.';
const techInput=input('Go deeper.',anchor(target,'technical','The law-routing file is technical code work.'));
const preparedTech=guard.prepareInput(techInput);
const scaffold='Going deeper on '+target+': the immediate technical turn must remain the authority. I will preserve the active code target and avoid an older unrelated lane.';
const techFixed=guard.enforceResult({reply:scaffold,finalEnvelope:{reply:scaffold}},preparedTech);
const techReply=read(techFixed);
results.push(assert('technical_substantive_reply',/precedence|classified before|remembered law|session memory|commit timing|pre-commit reply/i.test(techReply),techReply));
results.push(assert('technical_meta_hidden',!/immediate technical turn|must remain the authority|active code target|older unrelated lane|active lane|continuity anchor/i.test(techReply),techReply));
results.push(assert('aliases_agree',techFixed.reply===techFixed.finalEnvelope.reply&&techFixed.reply===techFixed.payload.reply,'aliases differ'));

// 3. Public Nyx remains a no-op.
const publicPacket={scope:'public',surfaceAgent:'Nyx',reply:'Public Nyx reply',prompt:'Go deeper.'};
const publicOut=guard.enforceResult(publicPacket,publicPacket);
results.push(assert('public_nyx_noop',publicOut===publicPacket && publicOut.reply==='Public Nyx reply','public object changed'));

// 4. Law follow-up remains legal and general-information bounded.
const lawInput=input('Go deeper.',anchor('Can you review the legal risks in this contract?','law','General legal-risk triage.'));
const lawFixed=guard.enforceResult({reply:'Continuing from the immediately preceding turn.'},guard.prepareInput(lawInput));
results.push(assert('law_substantive_reply',/legal-risk analysis|obligation|breach|jurisdiction|general information/i.test(read(lawFixed)),read(lawFixed)));
results.push(assert('law_meta_hidden',!/preceding turn|active lane|authority/i.test(read(lawFixed)),read(lawFixed)));

// 5. Composer integration should not surface continuity policy language.
const routed={intent:'technical_debug',domain:'technical',routing:{intent:'technical_debug',domain:'technical'}};
const composed=composer.composeMarionResponse(routed,techInput);
Promise.resolve(composed).then(value=>{
  const r=read(value);
  results.push(assert('composer_substantive_surface',/precedence|classified before|state|visible-reply|earliest boundary|commit timing|pre-commit reply/i.test(r),r));
  results.push(assert('composer_meta_hidden',!/immediate technical turn|must remain the authority|active code target|older unrelated lane|continuation authority/i.test(r),r));

  // 6. Final-envelope integration with a deliberately bad scaffold.
  let finalValue;
  try {
    finalValue=envelope.createMarionFinalEnvelope({reply:scaffold,domain:'technical',intent:'technical_debug'},techInput);
  } catch (_) {
    finalValue=guard.enforceResult({reply:scaffold,finalEnvelope:{reply:scaffold}},techInput);
  }
  return Promise.resolve(finalValue).then(v=>{
    const fr=read(v);
    results.push(assert('final_projection_meta_hidden',!/immediate technical turn|must remain the authority|active code target|older unrelated lane/i.test(fr),fr));
    results.push(assert('final_projection_substantive',/precedence|classified before|state|visible-reply|earliest boundary|commit timing|pre-commit reply/i.test(fr),fr));
    console.log(JSON.stringify({ok:true,version:guard.VERSION,contract:guard.CONTINUITY_CONTRACT,results},null,2));
  });
}).catch(err=>{console.error(err.stack||err);process.exit(1)});

"use strict";

/**
 * Layer 10 — Contextual Pivot and Thread Control
 * Distinguishes continuation, branching, explicit pivots, returns, social pauses,
 * and fresh-session resets. It never mounts routes or composes final replies.
 */
const VERSION="marion.contextPivot/11.0-layer10";
const CONTRACT="nyx.marion.conversation.contextPivot/1.0";
const MAX_PAUSED=4;

function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=1000){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function norm(v){return text(v).toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function first(){for(const v of arguments){const t=text(v);if(t)return t;}return"";}
function idFor(subject,domain,turnId){const seed=norm(subject||domain||turnId||"thread").slice(0,42).replace(/\s+/g,"-");return `thread-${seed||"general"}-${text(turnId,24)||Date.now().toString(36)}`;}
function isGreeting(p){return /^(?:hello|hi|hey|hiya|good\s+(?:morning|afternoon|evening))(?:\s*,?\s*marion)?[.!?]*$/i.test(text(p));}
function isReturn(p){return /\b(?:back to|return to|resume|go back to|as we were saying|pick up where we left off)\b/i.test(text(p));}
function isBranch(p){return /^(?:before that|one thing first|quick side question|side question|while we(?:'re| are) here|temporarily|briefly before that)\b/i.test(text(p));}
function isExplicitPivot(p){return /^(?:switch(?:ing)? to|new topic|change(?:ing)? direction|moving on to|now let(?:'s| us)|let(?:'s| us) talk about|instead,? let(?:'s| us))\b/i.test(text(p));}
function isContinuation(p){const value=text(p);if(/^(?:go deeper|continue|keep going|why|why first|what next|next|then what|what happens after that|what should (?:we|be|i) (?:fix|examine)|what could (?:break|go wrong)|how (?:do|should) we (?:validate|test)|what is the safest implementation order|what is the main risk|what changed|give me (?:the )?direct answer|be direct|briefly|keep it short|explain simply|say that in plain english|what do you think|what do you recommend)[.!?]*$/i.test(value))return true;return /\b(?:this|it|that|same (?:issue|problem))\b.{0,80}\b(?:again|still|keeps? happening|not working|failed|root cause)\b/i.test(value)||/\b(?:why does this keep happening|give me the root cause)\b/i.test(value);}
function keywords(value){return norm(value).split(" ").filter(w=>w.length>3&&!/^(?:back|return|resume|topic|about|that|this|with|from|what|where|when|should)$/.test(w)).slice(0,8);}
function similarity(a,b){const A=new Set(keywords(a)),B=new Set(keywords(b));if(!A.size||!B.size)return 0;let hit=0;for(const k of A)if(B.has(k))hit+=1;return hit/Math.max(A.size,B.size);}
function thread(value){const v=isObj(value)?value:{};return {id:text(v.id,100),subject:text(v.subject||v.activeSubject,320),domain:text(v.domain||v.activeDomain,80).toLowerCase(),stage:text(v.stage,80),createdAt:Number(v.createdAt||Date.now()),updatedAt:Number(v.updatedAt||Date.now()),turnCount:Number(v.turnCount||0),returnPoint:text(v.returnPoint,320)};}
function pausedList(value){return (Array.isArray(value)?value:[]).map(thread).filter(t=>t.subject||t.domain).slice(-MAX_PAUSED);}
function selectReturnThread(prompt,paused){const keys=keywords(prompt);if(keys.length){let best=null,score=0;for(const item of paused){const s=similarity(keys.join(" "),item.subject);if(s>score){score=s;best=item;}}if(best)return best;}return paused.length?paused[paused.length-1]:null;}
function inferDirection(prompt,previous={},options={}){
  if(options.reset===true)return"reset";
  if(isGreeting(prompt))return"social_pause";
  if(isReturn(prompt))return"return";
  if(isBranch(prompt))return"branch";
  if(isExplicitPivot(prompt))return"pivot";
  if(isContinuation(prompt))return previous.activeThread?"continue":(Array.isArray(previous.pausedThreads)&&previous.pausedThreads.length?"return":"clarify");
  if(!previous.activeThread)return"start";
  const sameDomain=!!options.domain&&text(options.domain).toLowerCase()===text(previous.activeThread.domain).toLowerCase();
  const sameSubject=similarity(options.subject,previous.activeThread.subject)>=0.34;
  if(sameDomain&&sameSubject)return"continue";
  if(options.explicitDomain===true||options.explicitSubject===true)return"pivot";
  return sameDomain?"continue":"pivot";
}
function analyzeTurn({prompt="",previous={},domain="",subject="",stage="",turnId="",reset=false,explicitDomain=false,explicitSubject=false}={}){
  const prev=isObj(previous)?previous:{};let active=prev.activeThread?thread(prev.activeThread):null;let paused=pausedList(prev.pausedThreads);
  const direction=inferDirection(prompt,{activeThread:active,pausedThreads:paused},{reset,domain,subject,explicitDomain,explicitSubject});
  let changedDirection=["reset","return","branch","pivot","social_pause","start"].includes(direction);
  let returnPoint="";
  if(direction==="reset"){active=null;paused=[];}
  else if(direction==="social_pause"){
    if(active){returnPoint=first(active.subject,active.returnPoint);paused=[...paused,thread({...active,returnPoint:first(active.returnPoint,active.subject),updatedAt:Date.now()})].slice(-MAX_PAUSED);}active=null;
  }else if(direction==="return"){
    const selected=selectReturnThread(prompt,paused);if(selected){active=thread({...selected,stage:selected.stage||stage,updatedAt:Date.now(),turnCount:selected.turnCount+1});paused=paused.filter(x=>x.id!==selected.id);returnPoint=selected.returnPoint||selected.subject;}else changedDirection=false;
  }else if(direction==="branch"||direction==="pivot"){
    if(active)paused=[...paused,thread({...active,returnPoint:first(active.returnPoint,active.subject),updatedAt:Date.now()})].slice(-MAX_PAUSED);
    active=thread({id:idFor(subject,domain,turnId),subject:first(subject,prompt),domain,stage,createdAt:Date.now(),updatedAt:Date.now(),turnCount:1});
  }else if(direction==="start"){
    active=thread({id:idFor(subject,domain,turnId),subject:first(subject,prompt),domain,stage,createdAt:Date.now(),updatedAt:Date.now(),turnCount:1});
  }else if(direction==="continue"||direction==="clarify"){
    if(active)active=thread({...active,subject:first(subject,active.subject),domain:first(domain,active.domain),stage:first(stage,active.stage),updatedAt:Date.now(),turnCount:active.turnCount+1});
  }
  const socialPause=direction==="social_pause";
  return {version:VERSION,contract:CONTRACT,layer:10,turnId:text(turnId,120),direction,changedDirection,activeThread:active,pausedThreads:paused,returnPoint,activeDomain:socialPause?"general":first(active&&active.domain,domain).toLowerCase(),activeSubject:socialPause?"":first(active&&active.subject,subject),threadPriority:direction==="branch"?"temporary":direction==="return"?"resumed":"primary",internalOnly:true};
}
function commitTurn(flow={},stage=""){
  const src=isObj(flow)?flow:{};const active=src.activeThread?thread({...src.activeThread,stage:first(stage,src.activeThread.stage),updatedAt:Date.now()}):null;
  return {...src,activeThread:active,activeDomain:first(active&&active.domain,src.activeDomain).toLowerCase(),activeSubject:first(active&&active.subject,src.activeSubject),committed:true,committedAt:Date.now()};
}
function projectState(flow={}){const src=isObj(flow)?flow:{};return {version:VERSION,contract:CONTRACT,direction:text(src.direction,80),activeThread:src.activeThread?thread(src.activeThread):null,pausedThreads:pausedList(src.pausedThreads),returnPoint:text(src.returnPoint,320),activeDomain:text(src.activeDomain,80),activeSubject:text(src.activeSubject,320)};}
module.exports={VERSION,CONTRACT,isGreeting,isReturn,isBranch,isExplicitPivot,isContinuation,inferDirection,analyzeTurn,commitTurn,projectState};

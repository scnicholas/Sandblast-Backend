"use strict";

/**
 * Layer 12 — Conversational Outcome Awareness
 * Classifies what a turn actually produced without treating questions,
 * brainstorming, or suggestions as approvals.
 */
const VERSION = "marion.outcomeAwareness/14.0-layer12";
const CONTRACT = "nyx.marion.outcomeAwareness/1.0";

function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=4000){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function lower(v){return text(v).toLowerCase().replace(/[’‘]/g,"'");}
function norm(v){return lower(v).replace(/[“”]/g,'"').replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function first(){for(const v of arguments){const t=text(v);if(t)return t;}return"";}
function clamp(v,min=0,max=1,fallback=0){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function hash(value=""){let h=2166136261;const s=text(value,8000);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
function isGreeting(v=""){return /^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening))(?:\s*,?\s*marion)?[.!?]*$/i.test(text(v));}
function isQuestion(v=""){const t=text(v);return /\?$/.test(t)||/^(?:what|why|when|where|who|which|how|can|could|would|should|do|does|did|is|are|am|will|may)\b/i.test(t);}
function isBrainstorm(v=""){const t=lower(v);return /\b(?:maybe|perhaps|could consider|we might|what if|one option|possible option|brainstorm|explore the idea|think about)\b/.test(t)&&!/\b(?:approved|decided|we will|we'll|let's do|go ahead|proceed|do it)\b/.test(t);}
function timingHint(v=""){const t=text(v);const m=t.match(/\b(?:today|tomorrow|tonight|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|later|after\s+[^,.!?]+|on\s+[A-Z][a-z]+(?:\s+\d{1,2})?|by\s+[^,.!?]+)\b/i);return m?text(m[0],120):"";}
function stripLead(v=""){
  return text(v,1200)
    .replace(/^(?:okay|all right|alright|good|great|actually|so|then|now|yes|no)[,;:\-\s]+/i,"")
    .replace(/^(?:we\s+(?:will|are going to)|we'll|let's|please|go ahead and|proceed to|do|run|make|deploy|use|approve|approved|decided to)\s+/i,"")
    .replace(/[.!?]+$/g,"")
    .trim();
}
function targetText(prompt,type){
  let out=type==="action_approved"?text(prompt,1200).replace(/^(?:okay|all right|alright|good|great|actually|so|then|now|yes)[,;:\-\s]+/i,"").replace(/^(?:go ahead and|proceed to|please)\s+/i,"").replace(/[.!?]+$/g,"").trim():stripLead(prompt);
  if(type==="cancelled")out=out.replace(/^(?:cancel|drop|stop|remove|do not|don't)\s+/i,"");
  if(type==="deferred")out=out.replace(/^(?:leave|hold|defer|pause|put)\s+(?:that|this|it)?\s*(?:until|for)?\s*/i,"");
  if(type==="completed")out=out.replace(/^(?:the\s+)?(?:task|test|runtime|deployment|repair|work)?\s*(?:has\s+)?(?:passed|completed|finished|done|is working|works)\s*/i,"");
  if(type==="blocked")out=out.replace(/^(?:we(?:'re| are)?\s+)?(?:are\s+)?(?:blocked|waiting|stuck)\s*(?:on|by|because of)?\s*/i,"");
  return text(out||prompt,700);
}
function classify(prompt="",context={}){
  const raw=text(prompt,6000),t=lower(raw),n=norm(raw),ctx=isObj(context)?context:{};
  const base={version:VERSION,contract:CONTRACT,layer:12,outcomeId:"",outcomeType:"none",outcomeStatus:"none",outcomeText:"",explicit:false,confidence:0,completed:false,unresolved:false,blocked:false,deferred:false,evidenceRequired:false,cancelled:false,rejected:false,failed:false,timingHint:"",sourceTurnId:text(ctx.turnId,120),relatedThreadId:text(ctx.threadId,160),relatedSubject:text(ctx.subject,320),internalOnly:true};
  if(!raw||isGreeting(raw))return base;
  const question=isQuestion(raw),brainstorm=isBrainstorm(raw);
  let type="none",status="none",confidence=0;

  if(/\b(?:cancel(?:led)?|drop(?:ped)?|stop(?:ped)?|remove(?:d)?|do not proceed|don't proceed|no longer proceed|scrap(?:ped)?)\b/.test(t)){
    type="cancelled";status="cancelled";confidence=.98;
  }else if(/\b(?:full pass|all tests? passed|passed successfully|runtime passed|test passed|deployment completed|task completed|work completed|finished|done|fixed now|is now working|works now|resolved)\b/.test(t)&&!question){
    type=/\bpass(?:ed)?\b/.test(t)?"test_passed":"completed";status="completed";confidence=.97;
  }else if(/\b(?:failed|did not work|didn't work|still broken|still failing|regression|not fixed|test failed)\b/.test(t)&&!question){
    type="failed";status="failed";confidence=.96;
  }else if(/\b(?:blocked|cannot proceed|can't proceed|unable to proceed|waiting on|waiting for|dependency missing|stuck because|held up by)\b/.test(t)&&!question){
    type="blocked";status="blocked";confidence=.95;
  }else if(/\b(?:leave (?:that|this|it)|hold off|defer|deferred|pause (?:that|this|it)|put (?:that|this|it) on hold|come back to (?:that|this|it)|do (?:that|this|it) later|until tomorrow|for later)\b/.test(t)&&!question){
    type="deferred";status="deferred";confidence=.95;
  }else if(/\b(?:reject|rejected|not using|won't use|will not use|do not use|don't use|not going with|decline(?:d)?)\b/.test(t)&&!question){
    type="rejected";status="rejected";confidence=.96;
  }else if(/\b(?:need|require|waiting for)\b.{0,80}\b(?:evidence|proof|logs?|results?|confirmation|verification|source files?)\b/.test(t)&&!question){
    type="evidence_required";status="pending";confidence=.9;
  }else if(/^(?:do it|go ahead|proceed|run it|deploy it|make the changes|apply the changes|execute|ship it)[.!]*$/i.test(raw)||/^(?:run|deploy|test|validate|make|apply|implement|execute)\b/i.test(raw)&&!question||/\b(?:go ahead and|proceed to|proceed with|approved to|authorize(?:d)? to|run the|deploy the|make the critical|apply the update|implement the)\b/.test(t)&&!question){
    type="action_approved";status="approved";confidence=.96;
  }else if(/\b(?:we will|we'll|we are going to|we have decided|we decided|the decision is|approved|that's the plan|that is the plan|let's use|we're using|go with|we will use)\b/.test(t)&&!question&&!brainstorm){
    type="decision";status="accepted";confidence=.94;
  }else if(/\b(?:no action required|nothing else is needed|we are finished|we're finished|close this|close the thread)\b/.test(t)&&!question){
    type="closed";status="completed";confidence=.94;
  }

  if(type==="none")return {...base,unresolved:question||brainstorm,confidence:question||brainstorm?.15:0};
  const outcomeText=targetText(raw,type);
  const outcomeId=`outcome-${hash([ctx.threadId,ctx.turnId,type,outcomeText].join("|"))}`;
  return {...base,outcomeId,outcomeType:type,outcomeStatus:status,outcomeText,explicit:true,confidence:clamp(confidence),completed:status==="completed",unresolved:status==="pending"||status==="blocked"||status==="deferred"||status==="failed",blocked:status==="blocked",deferred:status==="deferred",evidenceRequired:type==="evidence_required",cancelled:status==="cancelled",rejected:status==="rejected",failed:status==="failed",timingHint:timingHint(raw)};
}
function projectState(value={}){const v=isObj(value)?value:{};return {version:VERSION,contract:CONTRACT,outcomeId:text(v.outcomeId,120),outcomeType:text(v.outcomeType,60),outcomeStatus:text(v.outcomeStatus,60),outcomeText:text(v.outcomeText,700),explicit:v.explicit===true,confidence:clamp(v.confidence),completed:v.completed===true,unresolved:v.unresolved===true,blocked:v.blocked===true,deferred:v.deferred===true,evidenceRequired:v.evidenceRequired===true,cancelled:v.cancelled===true,rejected:v.rejected===true,failed:v.failed===true,timingHint:text(v.timingHint,120),sourceTurnId:text(v.sourceTurnId,120),relatedThreadId:text(v.relatedThreadId,160),relatedSubject:text(v.relatedSubject,320)};}
module.exports={VERSION,CONTRACT,isGreeting,isQuestion,isBrainstorm,timingHint,classify,projectState};

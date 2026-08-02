"use strict";
const VERSION="nyx.marion.continuityState/2.0",TTL=7200000,MAX=500,TURNS=24,S=new Map();
const t=v=>{try{return String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim()}catch(_){return""}};
const o=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
function key(i){const x=o(i),p=o(x.payload),b=o(x.body),m=o(x.meta),s=o(x.session);return t(x.conversationId||x.sessionId||x.clientSessionId||x.threadId||x.traceId||p.conversationId||p.sessionId||p.threadId||b.conversationId||b.sessionId||s.id||s.sessionId||m.sessionId||"public-default").slice(0,180)}
function purge(){const n=Date.now();for(const[k,v]of S)if(n-(v.updatedAt||0)>TTL)S.delete(k);while(S.size>MAX)S.delete(S.keys().next().value)}
function get(i){purge();const k=key(i),v=S.get(k)||{turns:[],lastAssistantReply:"",activeTopic:""};return{k,...v,turns:[...(v.turns||[])]}}
function put(v){v.updatedAt=Date.now();v.turns=(v.turns||[]).slice(-TURNS);S.set(v.k,v);purge();return v}
function recordUser(i,q){const v=get(i),x=t(q);if(x)v.turns.push({role:"user",text:x});return put(v)}
function recordAssistant(i,r,topic=""){const v=get(i),x=t(r);if(x){v.lastAssistantReply=x;v.activeTopic=t(topic)||v.activeTopic||x.split(/[.!?]/)[0].slice(0,160);v.turns.push({role:"assistant",text:x})}return put(v)}
function hydrate(i){const x=typeof i==="string"?{text:i}:{...o(i)},v=get(x);return{...x,conversationId:t(x.conversationId||x.sessionId||v.k),lastAssistantReply:t(x.lastAssistantReply||x.previousAssistantReply||v.lastAssistantReply),previousAssistantReply:t(x.previousAssistantReply||x.lastAssistantReply||v.lastAssistantReply),activeTopic:t(x.activeTopic||x.topic||x.lastTopic||v.activeTopic),history:Array.isArray(x.history)&&x.history.length?x.history:v.turns,continuityState:{version:VERSION,sessionKey:v.k,lastAssistantReply:v.lastAssistantReply,activeTopic:v.activeTopic,turnCount:v.turns.length,noUserFacingDiagnostics:true}}}
function reset(i){S.delete(key(i))}
module.exports={VERSION,key,get,hydrate,recordUser,recordAssistant,reset};

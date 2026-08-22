'use strict';

const VERSION = 'marion.lingosentinel.conversationStore/3.0';
const MAX_MESSAGES = Math.max(8, Math.min(100, Number(process.env.LS_PHASE3_HISTORY_LIMIT || 24) || 24));
const TTL_MS = Math.max(60000, Number(process.env.LS_PHASE3_HISTORY_TTL_MS || 30 * 60 * 1000) || 30 * 60 * 1000);
const conversations = new Map();

function text(v,n=4000){ return String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n); }
function key(sessionId, conversationId){ return text(sessionId,128)+'|'+text(conversationId || 'default',128); }
function prune(now = Date.now()) {
  for (const [k,v] of conversations) if (!v || now - v.updatedAt > TTL_MS) conversations.delete(k);
}
function append(input = {}) {
  prune();
  const sessionId=text(input.sessionId,128); if(!sessionId) return {ok:false,errors:['sessionId_required']};
  const conversationId=text(input.conversationId || 'default',128);
  const k=key(sessionId,conversationId), current=conversations.get(k)||{sessionId,conversationId,messages:[],updatedAt:Date.now()};
  const message={
    role:['host','remote','intelligence'].includes(input.role)?input.role:'host',
    sourceLanguage:text(input.sourceLanguage || input.language || 'en',16),
    targetLanguage:text(input.targetLanguage || '',16),
    text:text(input.text || input.message),
    canonicalText:text(input.canonicalText),
    timestamp:Number.isFinite(+input.timestamp)?+input.timestamp:Date.now()
  };
  if(!message.text && !message.canonicalText) return {ok:false,errors:['message_required']};
  current.messages.push(message); if(current.messages.length>MAX_MESSAGES) current.messages.splice(0,current.messages.length-MAX_MESSAGES);
  current.updatedAt=Date.now(); conversations.set(k,current);
  return {ok:true,count:current.messages.length,message,version:VERSION};
}
function getRecent(sessionId, conversationId, limit = 12) {
  prune(); const v=conversations.get(key(sessionId,conversationId));
  const n=Math.max(1,Math.min(MAX_MESSAGES,Number(limit)||12));
  return v ? v.messages.slice(-n).map(x=>({...x})) : [];
}
function clear(sessionId, conversationId) { return conversations.delete(key(sessionId,conversationId)); }
function reset(){ conversations.clear(); }
function getHealth(){ prune(); return {ok:true,service:'MarionLingoSentinelConversationStore',version:VERSION,conversations:conversations.size,maxMessages:MAX_MESSAGES,ttlMs:TTL_MS}; }

module.exports=Object.freeze({VERSION,MAX_MESSAGES,TTL_MS,append,getRecent,clear,reset,getHealth});

'use strict';
const Persistence=require('./LingoSentinelPersistenceAdapter');
const PublicProjection=require('./LingoSentinelPublicMessageProjection');
const VERSION='nyx.lingosentinel.messageStore/10.0-bounded-history';
const DEFAULT_LIMIT=Math.max(10,Math.min(500,Number(process.env.LINGOSENTINEL_ROOM_HISTORY_LIMIT)||100));
const staged=new Map();
function stage(message){ const validation=PublicProjection.validateProjection(PublicProjection.project(message)); if(!validation.ok)return{ok:false,errors:validation.errors}; const copy=PublicProjection.project(message); staged.set(copy.messageId,copy); return{ok:true,message:copy}; }
function commit(messageId){ const item=staged.get(String(messageId||'')); if(!item)return{ok:false,error:'STAGED_MESSAGE_NOT_FOUND'}; const result=Persistence.appendMessage(item); if(result.ok)staged.delete(item.messageId); return result; }
function discard(messageId){ return staged.delete(String(messageId||'')); }
function append(message){ const stagedResult=stage(message); return stagedResult.ok?commit(stagedResult.message.messageId):stagedResult; }
function getById(id){ return Persistence.getMessage(id); }
function listAfter(roomId,sequence,limit=DEFAULT_LIMIT){ return Persistence.listAfter(roomId,sequence,Math.max(1,Math.min(DEFAULT_LIMIT,Number(limit)||DEFAULT_LIMIT))); }
function listRecent(roomId,limit=DEFAULT_LIMIT){ return Persistence.listRecent(roomId,Math.max(1,Math.min(DEFAULT_LIMIT,Number(limit)||DEFAULT_LIMIT))); }
function getHighWaterMark(roomId){ return Persistence.getHighWater(roomId); }
function prune(cutoffMs){ return Persistence.prune(cutoffMs); }
function reset(){ staged.clear(); Persistence.reset(); }
function getHealth(){ return {ok:true,service:'LingoSentinelMessageStore',version:VERSION,staged:staged.size,historyLimit:DEFAULT_LIMIT,persistence:Persistence.getHealth()}; }
module.exports=Object.freeze({VERSION,DEFAULT_LIMIT,stage,commit,discard,append,getById,listAfter,listRecent,getHighWaterMark,prune,reset,getHealth});

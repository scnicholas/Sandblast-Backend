'use strict';
const MessageStore=require('./LingoSentinelMessageStore');
const PublicProjection=require('./LingoSentinelPublicMessageProjection');
const RecoveryPolicy=require('./LingoSentinelRecoveryPolicy');
const VERSION='nyx.lingosentinel.conversationRecovery/10.0-canonical-path';
function recover(roomId,query={}){const cfg=RecoveryPolicy.normalize(query);const messages=MessageStore.listAfter(roomId,cfg.afterSequence,cfg.limit).map(PublicProjection.project);const high=MessageStore.getHighWaterMark(roomId);const expected=cfg.afterSequence+1;const complete=messages.length===0?cfg.afterSequence>=high:messages[0].sequence===expected&&messages.every((m,i)=>i===0||m.sequence===messages[i-1].sequence+1);return{ok:true,contract:'lingosentinel.recovery/1.0',roomId,requestedAfterSequence:cfg.afterSequence,highWaterMark:high,complete,messages,recoveredCount:messages.length};}
function recent(roomId,query={}){const cfg=RecoveryPolicy.normalize(query);const messages=MessageStore.listRecent(roomId,cfg.limit).map(PublicProjection.project);return{ok:true,contract:'lingosentinel.recovery/1.0',roomId,requestedAfterSequence:null,highWaterMark:MessageStore.getHighWaterMark(roomId),complete:true,messages,recoveredCount:messages.length};}
function getHealth(){return{ok:true,service:'LingoSentinelConversationRecovery',version:VERSION,canonicalReceiverRequired:true,messageStore:MessageStore.getHealth(),policy:RecoveryPolicy.getHealth()};}
module.exports=Object.freeze({VERSION,recover,recent,getHealth});

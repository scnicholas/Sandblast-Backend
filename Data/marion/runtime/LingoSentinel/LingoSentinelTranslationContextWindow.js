'use strict';
const MessageStore=require('./LingoSentinelMessageStore');
const VERSION='nyx.lingosentinel.translationContextWindow/12.0-bounded-room';
const MAX_MESSAGES=Math.max(1,Math.min(12,Number(process.env.LINGOSENTINEL_CONTEXT_MAX_MESSAGES)||8));
const MAX_CHARS=Math.max(500,Math.min(12000,Number(process.env.LINGOSENTINEL_CONTEXT_MAX_CHARS)||6000));
function build(input={}){const roomId=String(input.roomId||''),messageId=String(input.messageId||'');if(!roomId)return {ok:false,error:'ROOM_ID_REQUIRED'};const recent=MessageStore.listRecent(roomId,Math.max(1,Math.min(MAX_MESSAGES,Number(input.limit)||MAX_MESSAGES)));let chars=0;const messages=[];for(const m of recent){if(messageId&&m.messageId===messageId)continue;const text=String(m.originalText||'');if(chars+text.length>MAX_CHARS)break;messages.push({messageId:m.messageId,sequence:m.sequence,senderClientId:m.sender&&m.sender.clientId||'',sourceLanguage:m.sourceLanguage||'en',originalText:text});chars+=text.length;}return {ok:true,contract:'lingosentinel.translationContext/1.0',roomId,messageId,sourceLanguage:String(input.sourceLanguage||'en'),targetLanguage:String(input.targetLanguage||''),locale:String(input.locale||''),formality:String(input.formality||'neutral'),recentMessageCount:messages.length,characters:chars,messages,contextVersion:1,privateFieldsIncluded:false};}
function createWindow(input){return build(input);}
function getHealth(){return {ok:true,service:'LingoSentinelTranslationContextWindow',version:VERSION,maxMessages:MAX_MESSAGES,maxChars:MAX_CHARS,crossRoomContextAllowed:false};}
module.exports=Object.freeze({VERSION,MAX_MESSAGES,MAX_CHARS,build,createWindow,getHealth});

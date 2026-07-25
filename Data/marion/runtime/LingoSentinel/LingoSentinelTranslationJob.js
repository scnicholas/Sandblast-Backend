'use strict';
const crypto = require('crypto');
const VERSION = 'nyx.lingosentinel.translationJob/11.0-message-bound';
const CONTRACT = 'lingosentinel.translationJob/1.0';
const STATES = Object.freeze(['pending','processing','translated','low_confidence','failed','expired','original_only','clarification_recommended']);
function clean(v){return String(v==null?'':v).trim();}
function language(v,f='en'){const x=clean(v).toLowerCase().replace(/_/g,'-').split('-')[0];return ['en','fr','es','zh','pt'].includes(x)?x:f;}
function createId(){return `lsj_${Date.now().toString(36)}_${crypto.randomBytes(10).toString('hex')}`.slice(0,96);}
function create(input={}){
  const messageId=clean(input.messageId), roomId=clean(input.roomId), sourceLanguage=language(input.sourceLanguage,'en'), targetLanguage=language(input.targetLanguage,'');
  if(!messageId||!roomId||!targetLanguage) return {ok:false,errors:['messageId, roomId, and targetLanguage are required.']};
  if(sourceLanguage===targetLanguage) return {ok:false,errors:['Translation is not required for the same language.'],code:'TRANSLATION_NOT_REQUIRED'};
  const now=new Date().toISOString();
  return {ok:true,job:Object.freeze({contract:CONTRACT,jobId:createId(),messageId,roomId,sourceLanguage,targetLanguage,locale:clean(input.locale).slice(0,16),formality:['neutral','formal','informal'].includes(clean(input.formality).toLowerCase())?clean(input.formality).toLowerCase():'neutral',status:'pending',attempt:0,createdAt:now,updatedAt:now,expiresAt:new Date(Date.now()+(Number(input.ttlMs)||15*60*1000)).toISOString(),version:1})};
}
function getHealth(){return {ok:true,service:'LingoSentinelTranslationJob',version:VERSION,contract:CONTRACT,states:STATES.slice(),messageBound:true,credentialsStored:false};}
module.exports=Object.freeze({VERSION,CONTRACT,STATES,create,createJob:create,createId,getHealth});

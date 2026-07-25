'use strict';
const Resolver=require('./LingoSentinelRecipientLanguageResolver');
const VERSION='nyx.lingosentinel.messagePolicy/12.0-translation-sidecar';
const CONTRACT='lingosentinel.message/1.0';
const EVENT_TYPE='LINGOSENTINEL_MESSAGE_CREATED';
const MESSAGE_TYPE='text';
const MAX_TEXT_LENGTH=4000;
const MAX_REQUEST_ID_LENGTH=96;
const ACCEPTED_MODES=Object.freeze(['one_to_one','group_room']);
const SERVER_CONTROLLED_FIELDS=Object.freeze([
  'messageId','sequence','sender','displayText','originalText','translation',
  'eventType','contract','createdAt','publishedAt','version','governance',
  'provider','capability','tokenRequest','sessionId'
]);
function safeString(v){return String(v==null?'':v).trim();}
function normalizeMode(v){
  const x=safeString(v||'group_room');
  if(['one','one_to_one','direct','dm','private'].includes(x))return 'one_to_one';
  if(['group','group_room','room','community'].includes(x))return 'group_room';
  return x;
}
function normalizeText(v){return String(v==null?'':v).replace(/\r\n?/g,'\n');}
function containsBlockedControl(t){return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(t);}
function containsExecutableMarkup(t){
  return /<\s*(?:script|iframe|object|embed|meta|link)\b/i.test(t) ||
    /\bon[a-z]+\s*=\s*["']/i.test(t) || /javascript\s*:/i.test(t);
}
function clientControlsServerField(input={}){
  return SERVER_CONTROLLED_FIELDS.filter(field=>Object.prototype.hasOwnProperty.call(input,field));
}
function validateRawRequest(input={}){
  const errors=[];
  const text=normalizeText(input.text||input.message||input.input||'');
  const roomId=safeString(input.roomId||input.conversationId||input.channelId);
  const clientRequestId=safeString(input.clientRequestId||input.requestId);
  const type=safeString(input.type||MESSAGE_TYPE).toLowerCase();
  const mode=normalizeMode(input.mode||'group_room');
  const controlled=clientControlsServerField(input);
  const sourceLanguage=Resolver.language(input.sourceLanguage||input.source||'en','');
  const targetLanguage=Resolver.language(input.targetLanguage||input.target||sourceLanguage,'');
  if(!roomId)errors.push({code:'ROOM_ID_REQUIRED',field:'roomId'});
  if(!clientRequestId)errors.push({code:'CLIENT_REQUEST_ID_REQUIRED',field:'clientRequestId'});
  if(clientRequestId.length>MAX_REQUEST_ID_LENGTH)errors.push({code:'CLIENT_REQUEST_ID_TOO_LONG',field:'clientRequestId'});
  if(type!==MESSAGE_TYPE)errors.push({code:'TEXT_MESSAGES_ONLY',field:'type'});
  if(!ACCEPTED_MODES.includes(mode))errors.push({code:'MESSAGE_MODE_NOT_ENABLED',field:'mode'});
  if(!text.trim())errors.push({code:'MESSAGE_TEXT_REQUIRED',field:'text'});
  if(text.length>MAX_TEXT_LENGTH)errors.push({code:'MESSAGE_TEXT_TOO_LONG',field:'text'});
  if(containsBlockedControl(text))errors.push({code:'MESSAGE_CONTROL_CHARACTER_BLOCKED',field:'text'});
  if(containsExecutableMarkup(text))errors.push({code:'EXECUTABLE_MARKUP_BLOCKED',field:'text'});
  if(controlled.length)errors.push({code:'SERVER_CONTROLLED_FIELDS_REJECTED',fields:controlled});
  if(!sourceLanguage)errors.push({code:'SOURCE_LANGUAGE_UNSUPPORTED',field:'sourceLanguage'});
  if(!targetLanguage)errors.push({code:'TARGET_LANGUAGE_UNSUPPORTED',field:'targetLanguage'});
  return {
    ok:errors.length===0,
    errors,
    normalized:{
      roomId,clientRequestId,type:MESSAGE_TYPE,mode,text,
      sourceLanguage:sourceLanguage||'en',
      targetLanguage:targetLanguage||sourceLanguage||'en',
      translationRequired:!!sourceLanguage&&!!targetLanguage&&sourceLanguage!==targetLanguage
    }
  };
}
function getHealth(){
  return {
    ok:true,service:'LingoSentinelMessagePolicy',version:VERSION,contract:CONTRACT,
    eventType:EVENT_TYPE,messageType:MESSAGE_TYPE,maxTextLength:MAX_TEXT_LENGTH,
    acceptedModes:ACCEPTED_MODES.slice(),supportedLanguages:Resolver.SUPPORTED.slice(),
    translationSidecar:true,originalDeliveryBlockedByTranslation:false,
    attachmentsEnabled:false,executableMarkupAllowed:false
  };
}
module.exports=Object.freeze({
  VERSION,CONTRACT,EVENT_TYPE,MESSAGE_TYPE,MAX_TEXT_LENGTH,MAX_REQUEST_ID_LENGTH,
  ACCEPTED_MODES,SERVER_CONTROLLED_FIELDS,safeString,normalizeMode,normalizeText,
  containsBlockedControl,containsExecutableMarkup,clientControlsServerField,
  validateRawRequest,getHealth
});

'use strict';
const Resolver=require('./LingoSentinelRecipientLanguageResolver');
const VERSION='nyx.lingosentinel.translationDispatchPolicy/11.0-original-first';
const TIMEOUT_MS=Math.max(1000,Math.min(30000,Number(process.env.LINGOSENTINEL_TRANSLATION_TIMEOUT_MS)||10000));
const MAX_ATTEMPTS=Math.max(1,Math.min(3,Number(process.env.LINGOSENTINEL_TRANSLATION_MAX_ATTEMPTS)||2));
function evaluate(input={}){const source=Resolver.language(input.sourceLanguage,'en'),target=Resolver.language(input.targetLanguage,'');const text=String(input.text==null?input.originalText||'':input.text);const errors=[];if(!text.trim())errors.push('TRANSLATION_TEXT_REQUIRED');if(text.length>4000)errors.push('TRANSLATION_TEXT_TOO_LONG');if(!target)errors.push('TARGET_LANGUAGE_UNSUPPORTED');if(source===target)return {ok:true,required:false,status:'not_required',sourceLanguage:source,targetLanguage:target||source,errors:[]};return {ok:errors.length===0,required:true,status:errors.length?'failed':'pending',sourceLanguage:source,targetLanguage:target,timeoutMs:TIMEOUT_MS,maxAttempts:MAX_ATTEMPTS,originalDeliveryBlocked:false,errors};}
function getHealth(){return {ok:true,service:'LingoSentinelTranslationDispatchPolicy',version:VERSION,timeoutMs:TIMEOUT_MS,maxAttempts:MAX_ATTEMPTS,originalDeliveryBlocked:false,supportedLanguages:Resolver.SUPPORTED.slice()};}
module.exports=Object.freeze({VERSION,TIMEOUT_MS,MAX_ATTEMPTS,evaluate,getHealth});

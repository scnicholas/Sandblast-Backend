'use strict';

const Contract = require('./MarionLingoSentinelCognitiveContract');
const VERSION = 'marion.lingosentinel.translationBridge/3.0';
let injectedTranslator = null, cached = undefined;

function text(v,n=4000){ return String(v==null?'':v).trim().slice(0,n); }
function registerTranslator(fn){ injectedTranslator=typeof fn==='function'?fn:null; return !!injectedTranslator; }
function moduleTranslator(mod){
  if(!mod) return null;
  if(typeof mod.translateText==='function') return (t,o)=>mod.translateText(t,o);
  if(typeof mod.translate==='function') return (t,o)=>mod.translate(t,o);
  if(typeof mod.process==='function') return (t,o)=>mod.process({text:t,...o});
  if(typeof mod.run==='function') return (t,o)=>mod.run({text:t,...o});
  if(typeof mod==='function') return (t,o)=>mod(t,o);
  return null;
}
function resolveTranslator(){
  if(injectedTranslator) return injectedTranslator;
  if(cached!==undefined) return cached;
  for(const p of ['../UniversalTranslatorAdapter','../UniversalTranslatorAdapter.js']){
    try{ const fn=moduleTranslator(require(p)); if(fn){cached=fn;return fn;} }catch(_){}
  }
  cached=null; return null;
}
function normalizeResult(raw, original, sourceLanguage, targetLanguage){
  if(typeof raw==='string') return {ok:!!raw,text:text(raw),translated:text(raw)!==original,provider:'custom',warnings:[]};
  const r=raw&&typeof raw==='object'?raw:{};
  const nested=r.message&&typeof r.message==='object'?r.message:{};
  const out=text(r.text||r.translatedText||r.translation||r.targetText||r.output||nested.translatedText||nested.translation||nested.text||original);
  const meta=r.meta&&typeof r.meta==='object'?r.meta:{};
  const warnings=[]; if(meta.warning) warnings.push(String(meta.warning)); if(r.warning) warnings.push(String(r.warning));
  return {ok:r.ok!==false&&!!out,text:out,translated:meta.translated===true||r.translated===true||out!==original,provider:text(meta.provider||r.provider||'UniversalTranslatorAdapter',80),warnings};
}
async function translate(inputText, source, target, options = {}){
  const original=text(inputText), sourceLanguage=Contract.normalizeLanguage(source,'en'), targetLanguage=Contract.normalizeLanguage(target,sourceLanguage);
  if(!original) return {ok:false,text:'',translated:false,provider:'none',warnings:['empty_text'],sourceLanguage,targetLanguage};
  if(sourceLanguage===targetLanguage) return {ok:true,text:original,translated:false,provider:'identity',warnings:['same-language'],sourceLanguage,targetLanguage};
  const fn=resolveTranslator();
  if(!fn) return {ok:false,text:original,translated:false,provider:'unavailable',warnings:['translator_unavailable'],sourceLanguage,targetLanguage};
  try{
    const raw=await fn(original,{sourceLanguage,targetLanguage,context:options.context||'lingosentinel-cognitive',domain:options.domain||'general',cultureContext:options.cultureContext||'general',preserveIntent:true,preserveTone:true});
    return {...normalizeResult(raw,original,sourceLanguage,targetLanguage),sourceLanguage,targetLanguage};
  }catch(e){ return {ok:false,text:original,translated:false,provider:'error',warnings:[text(e&&e.message||'translation_error',160)],sourceLanguage,targetLanguage}; }
}
function normalizeForMarion(t,source,o={}){ return translate(t,source,Contract.CANONICAL_LANGUAGE,{...o,context:'lingosentinel-input-canonicalization'}); }
function localizeFromMarion(t,target,o={}){ return translate(t,Contract.CANONICAL_LANGUAGE,target,{...o,context:'lingosentinel-output-localization'}); }
function getHealth(){ return {ok:!!resolveTranslator(),service:'MarionLingoSentinelTranslationBridge',version:VERSION,translatorReady:!!resolveTranslator(),canonicalLanguage:Contract.CANONICAL_LANGUAGE}; }
module.exports=Object.freeze({VERSION,registerTranslator,resolveTranslator,translate,normalizeForMarion,localizeFromMarion,getHealth});

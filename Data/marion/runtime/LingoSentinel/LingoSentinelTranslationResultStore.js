'use strict';
const Envelope=require('./LingoSentinelTranslationResultEnvelope');
const VERSION='nyx.lingosentinel.translationResultStore/11.0-bounded';
const DEFAULT_TTL_MS=Math.max(60000,Math.min(7*24*60*60*1000,Number(process.env.LINGOSENTINEL_TRANSLATION_RETENTION_MS)||24*60*60*1000));
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
class Store{constructor(){this.results=new Map();this.byMessage=new Map();}
 key(messageId,target){return `${String(messageId||'')}\u0000${String(target||'').toLowerCase()}`;}
 put(input){const result=Envelope.build(input),valid=Envelope.validate(result);if(!valid.ok)return {ok:false,errors:valid.errors};const key=this.key(result.messageId,result.targetLanguage),existing=this.results.get(key);if(existing&&existing.translationId===result.translationId&&existing.status===result.status)return {ok:true,result:clone(existing),duplicate:true};this.results.set(key,result);if(!this.byMessage.has(result.messageId))this.byMessage.set(result.messageId,new Set());this.byMessage.get(result.messageId).add(key);return {ok:true,result:clone(result),duplicate:false};}
 get(messageId,target){return clone(this.results.get(this.key(messageId,target))||null);}
 list(messageId){return Array.from(this.byMessage.get(String(messageId||''))||[]).map(k=>this.results.get(k)).filter(Boolean).map(clone);}
 listForMessages(ids=[]){return ids.flatMap(id=>this.list(id));}
 prune(now=Date.now()){let n=0;for(const [k,r] of this.results){const t=Date.parse(r.createdAt||0);if(Number.isFinite(t)&&now-t>DEFAULT_TTL_MS){this.results.delete(k);const s=this.byMessage.get(r.messageId);if(s){s.delete(k);if(!s.size)this.byMessage.delete(r.messageId);}n++;}}return n;}
 reset(){this.results.clear();this.byMessage.clear();}
 getHealth(){return {ok:true,service:'LingoSentinelTranslationResultStore',version:VERSION,results:this.results.size,messages:this.byMessage.size,retentionMs:DEFAULT_TTL_MS,restartDurable:false,multiInstanceReady:false};}}
const singleton=new Store();module.exports=singleton;module.exports.VERSION=VERSION;module.exports.Store=Store;

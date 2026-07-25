'use strict';
const Job=require('./LingoSentinelTranslationJob');
const VERSION='nyx.lingosentinel.translationStateRegistry/11.0-claimed-jobs';
const ALLOWED={pending:['processing','expired'],processing:['translated','low_confidence','failed','original_only','clarification_recommended','expired'],failed:['processing','expired'],low_confidence:[],translated:[],original_only:[],clarification_recommended:[],expired:[]};
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
class Registry{
 constructor(){this.jobs=new Map();this.byKey=new Map();}
 key(v){return `${v.messageId}\u0000${v.targetLanguage}`;}
 create(input){const built=Job.create(input);if(!built.ok)return built;const key=this.key(built.job),existingId=this.byKey.get(key);if(existingId){return {ok:true,job:clone(this.jobs.get(existingId)),existing:true};}this.jobs.set(built.job.jobId,clone(built.job));this.byKey.set(key,built.job.jobId);return {ok:true,job:clone(built.job),existing:false};}
 get(id){return clone(this.jobs.get(String(id||''))||null);}
 getByMessageLanguage(messageId,targetLanguage){const id=this.byKey.get(`${String(messageId||'')}\u0000${String(targetLanguage||'').toLowerCase()}`);return id?this.get(id):null;}
 claim(id){const item=this.jobs.get(String(id||''));if(!item)return {ok:false,error:'TRANSLATION_JOB_NOT_FOUND'};if(item.status==='processing')return {ok:false,error:'TRANSLATION_JOB_ALREADY_CLAIMED'};if(!['pending','failed'].includes(item.status))return {ok:false,error:'TRANSLATION_JOB_NOT_CLAIMABLE'};item.status='processing';item.attempt=(item.attempt||0)+1;item.updatedAt=new Date().toISOString();return {ok:true,job:clone(item)};}
 transition(id,next,details={}){const item=this.jobs.get(String(id||''));if(!item)return {ok:false,error:'TRANSLATION_JOB_NOT_FOUND'};if(!(ALLOWED[item.status]||[]).includes(next))return {ok:false,error:'TRANSLATION_STATE_TRANSITION_INVALID',from:item.status,to:next};item.status=next;item.updatedAt=new Date().toISOString();if(details.errorCode)item.errorCode=String(details.errorCode).slice(0,80);if(details.translationId)item.translationId=String(details.translationId).slice(0,96);this.jobs.set(item.jobId,item);return {ok:true,job:clone(item)};}
 prune(now=Date.now()){let removed=0;for(const [id,item] of this.jobs){if(Date.parse(item.expiresAt||0)<=now){this.jobs.delete(id);this.byKey.delete(this.key(item));removed++;}}return removed;}
 reset(){this.jobs.clear();this.byKey.clear();}
 getHealth(){return {ok:true,service:'LingoSentinelTranslationStateRegistry',version:VERSION,jobs:this.jobs.size,uniqueMessageLanguage:true,claimRequired:true};}
}
const singleton=new Registry();module.exports=singleton;module.exports.VERSION=VERSION;module.exports.Registry=Registry;

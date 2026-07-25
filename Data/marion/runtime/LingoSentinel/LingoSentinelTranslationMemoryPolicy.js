'use strict';
const crypto=require('crypto');
const VERSION='nyx.lingosentinel.translationMemoryPolicy/12.0-partitioned';
function clean(v){return String(v==null?'':v).trim();}
function partition(input={}){const tenant=clean(input.tenantId||'sandblast').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,64)||'sandblast';const scope=input.privateRoom===true?'room':'tenant';const room=scope==='room'?clean(input.roomId).replace(/[^a-zA-Z0-9:_-]/g,'-').slice(0,96):'';return `${tenant}:${scope}${room?':'+room:''}`;}
function contextHash(input={}){const stable=JSON.stringify({sourceLanguage:clean(input.sourceLanguage),targetLanguage:clean(input.targetLanguage),locale:clean(input.locale),formality:clean(input.formality),protectedTerms:[...(input.protectedTerms||[])].map(clean).sort(),contextVersion:Number(input.contextVersion)||1});return crypto.createHash('sha256').update(stable).digest('hex');}
function canReuse(entry={},request={}){if(!entry||entry.status!=='translated'||Number(entry.confidence)<0.8)return false;if(clean(entry.partition)!==partition(request))return false;if(clean(entry.contextHash)!==contextHash(request))return false;return clean(entry.sourceText)===clean(request.sourceText||request.text);}
function getHealth(){return {ok:true,service:'LingoSentinelTranslationMemoryPolicy',version:VERSION,privateRoomsGlobalMemory:false,lowConfidenceReusable:false,contextSensitive:true};}
module.exports=Object.freeze({VERSION,partition,contextHash,canReuse,getHealth});

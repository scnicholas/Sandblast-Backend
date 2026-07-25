'use strict';
const Policy=require('./LingoSentinelTranslationMemoryPolicy');
const VERSION='nyx.lingosentinel.translationMemory/12.0-partitioned-memory';
class Memory{constructor(){this.items=new Map();}
 key(input){return `${Policy.partition(input)}\u0000${String(input.sourceLanguage||'')}\u0000${String(input.targetLanguage||'')}\u0000${String(input.sourceText||input.text||'')}`;}
 get(input){const item=this.items.get(this.key(input));return item&&Policy.canReuse(item,input)?JSON.parse(JSON.stringify(item)):null;}
 put(input,result){if(!result||result.status!=='translated'||Number(result.confidence)<0.8)return {ok:false,error:'TRANSLATION_MEMORY_RESULT_NOT_REUSABLE'};const entry={partition:Policy.partition(input),contextHash:Policy.contextHash(input),sourceText:String(input.sourceText||input.text||''),translatedText:String(result.translatedText||''),sourceLanguage:String(input.sourceLanguage||''),targetLanguage:String(input.targetLanguage||''),status:'translated',confidence:Number(result.confidence),createdAt:new Date().toISOString()};this.items.set(this.key(input),entry);return {ok:true,entry:{...entry}};}
 reset(){this.items.clear();}
 getHealth(){return {ok:true,service:'LingoSentinelTranslationMemory',version:VERSION,entries:this.items.size,partitionPolicy:Policy.getHealth()};}}
const singleton=new Memory();module.exports=singleton;module.exports.VERSION=VERSION;module.exports.Memory=Memory;

'use strict';
const Adapter=require('./ArgosTranslationAdapter');
const Memory=require('./LingoSentinelTranslationMemory');
const VERSION='nyx.lingosentinel.translationOrchestrator/12.0-protected-context';
class Orchestrator{constructor(options={}){this.adapter=options.adapter||Adapter;this.memory=options.memory||Memory;}
 async translate(input={},options={}){const cached=this.memory.get({...input,sourceText:input.text});if(cached)return {ok:true,translatedText:cached.translatedText,confidence:cached.confidence,provider:'memory',memoryHit:true};const result=await this.adapter.translate(input,options);if(result.ok)this.memory.put({...input,sourceText:input.text},{translatedText:result.translatedText,status:'translated',confidence:result.confidence});return {...result,memoryHit:false};}
 getHealth(){return {ok:true,service:'LingoSentinelTranslationOrchestrator',version:VERSION,adapter:this.adapter.getHealth?this.adapter.getHealth():null,memory:this.memory.getHealth?this.memory.getHealth():null};}}
const singleton=new Orchestrator();module.exports=singleton;module.exports.VERSION=VERSION;module.exports.Orchestrator=Orchestrator;

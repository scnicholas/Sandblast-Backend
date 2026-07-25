'use strict';
const Resolver=require('./LingoSentinelRecipientLanguageResolver');
const VERSION='nyx.lingosentinel.conversationLanguageState/12.0-room-scoped';
class Store{constructor(){this.rooms=new Map();}
 set(roomId,clientId,input={}){const r=String(roomId||''),c=String(clientId||'');if(!r||!c)return {ok:false,error:'ROOM_AND_CLIENT_REQUIRED'};if(!this.rooms.has(r))this.rooms.set(r,new Map());const current=this.rooms.get(r).get(c)||{};const value={clientId:c,sourceLanguage:Resolver.language(input.sourceLanguage,current.sourceLanguage||'en'),preferredLanguage:Resolver.language(input.preferredLanguage||input.targetLanguage,current.preferredLanguage||''),locale:String(input.locale||current.locale||'').slice(0,16),formality:['neutral','formal','informal'].includes(String(input.formality||'').toLowerCase())?String(input.formality).toLowerCase():(current.formality||'neutral'),updatedAt:new Date().toISOString(),explicitOnly:true,inferredFromLocation:false};this.rooms.get(r).set(c,value);return {ok:true,state:{...value}};}
 get(roomId,clientId){const v=this.rooms.get(String(roomId||''))?.get(String(clientId||''));return v?{...v}:null;}
 list(roomId){return Array.from(this.rooms.get(String(roomId||''))?.values()||[]).map(v=>({...v}));}
 remove(roomId,clientId){const m=this.rooms.get(String(roomId||''));if(!m)return false;const d=m.delete(String(clientId||''));if(!m.size)this.rooms.delete(String(roomId||''));return d;}
 reset(){this.rooms.clear();}
 getHealth(){return {ok:true,service:'LingoSentinelConversationLanguageState',version:VERSION,rooms:this.rooms.size,roomScoped:true,locationInference:false};}}
const singleton=new Store();module.exports=singleton;module.exports.VERSION=VERSION;module.exports.Store=Store;

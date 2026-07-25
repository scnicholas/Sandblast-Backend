'use strict';
const VERSION='nyx.lingosentinel.protectedTerms/12.0-registry';
const GLOBAL=Object.freeze(['Marion','LingoSentinel','Sandblast']);
function clean(v){return String(v==null?'':v).replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,80);}
function normalize(values=[]){return Array.from(new Set(GLOBAL.concat(Array.isArray(values)?values:[]).map(clean).filter(Boolean))).slice(0,50);}
function getGlobalTerms(){return GLOBAL.slice();}
function getHealth(){return {ok:true,service:'LingoSentinelProtectedTerms',version:VERSION,globalTerms:GLOBAL.slice(),executableTermsAllowed:false};}
module.exports=Object.freeze({VERSION,GLOBAL,normalize,getGlobalTerms,getHealth});

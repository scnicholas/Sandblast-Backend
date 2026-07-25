'use strict';
const VERSION='nyx.lingosentinel.translationConfidence/12.0-composite';
function score(input={}){let value=Number(input.providerConfidence);if(!Number.isFinite(value))value=0.75;if(input.protectedTermsIntact===false)value-=0.35;if(input.ambiguityDecision==='translate_with_caution')value-=0.12;if(input.ambiguityDecision==='reject')value=0;if(input.contextConsistent===false)value-=0.2;if(!String(input.translatedText||'').trim())value=0;return Math.max(0,Math.min(1,value));}
function classify(value){const n=Number(value);if(!Number.isFinite(n)||n<0.45)return 'failed';if(n<0.75)return 'low_confidence';return 'translated';}
function getHealth(){return {ok:true,service:'LingoSentinelTranslationConfidence',version:VERSION,protectedTermIntegrityWeighted:true,ambiguityWeighted:true};}
module.exports=Object.freeze({VERSION,score,classify,getHealth});

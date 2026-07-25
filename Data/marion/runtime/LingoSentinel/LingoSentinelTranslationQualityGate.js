'use strict';
const Confidence=require('./LingoSentinelTranslationConfidence');
const VERSION='nyx.lingosentinel.translationQualityGate/12.0-original-fallback';
function evaluate(input={}){const confidence=Confidence.score(input);let decision='accept',status='translated';if(!String(input.translatedText||'').trim()||input.protectedTermsIntact===false){decision='original_only';status='original_only';}else if(input.ambiguityDecision==='reject'){decision='reject';status='failed';}else if(input.clarificationRecommended===true){decision='clarification_recommended';status='clarification_recommended';}else if(confidence<0.75){decision='accept_with_notice';status='low_confidence';}return {ok:decision!=='reject',decision,status,confidence,showOriginal:true,originalAuthoritative:true};}
function assess(input){return evaluate(input);}
function getHealth(){return {ok:true,service:'LingoSentinelTranslationQualityGate',version:VERSION,originalFallback:true,lowConfidenceNotice:true,emptyOutputRejected:true};}
module.exports=Object.freeze({VERSION,evaluate,assess,getHealth});

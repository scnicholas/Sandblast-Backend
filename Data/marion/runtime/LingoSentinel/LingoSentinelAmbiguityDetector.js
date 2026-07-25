'use strict';
const VERSION='nyx.lingosentinel.ambiguityDetector/12.0-structured';
const IDIOMS=[/\bbreak a leg\b/i,/\bpiece of cake\b/i,/\bhit the road\b/i,/\bon the fence\b/i,/\bunder the weather\b/i];
function detect(input){const text=String(input&&typeof input==='object'?input.text||input.originalText||'':input||'').trim();const flags=[];if(!text)flags.push({code:'EMPTY_INPUT',severity:'high'});if(text&&text.split(/\s+/).length<3)flags.push({code:'FRAGMENTARY_INPUT',severity:'low'});if(/\b(it|this|that|they|he|she)\b/i.test(text)&&!/[.!?].*\b(it|this|that|they|he|she)\b/i.test(text))flags.push({code:'UNCLEAR_REFERENCE',severity:'medium'});if(IDIOMS.some(rx=>rx.test(text)))flags.push({code:'IDIOM_DETECTED',severity:'medium'});if(/\b(bank|bat|right|light|charge|fair)\b/i.test(text))flags.push({code:'POLYSEMY_RISK',severity:'low'});const material=flags.some(f=>['high','medium'].includes(f.severity));return {ok:true,decision:flags.some(f=>f.code==='EMPTY_INPUT')?'reject':material?'translate_with_caution':'clear',flags,clarificationRecommended:flags.some(f=>f.code==='UNCLEAR_REFERENCE'),preserveOriginal:material};}
function analyze(input){return detect(input);}
function getHealth(){return {ok:true,service:'LingoSentinelAmbiguityDetector',version:VERSION,structuredFlags:true,meaningInvented:false};}
module.exports=Object.freeze({VERSION,detect,analyze,getHealth});

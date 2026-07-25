'use strict';
const VERSION='nyx.lingosentinel.culturalContextPolicy/12.0-explicit-only';
function normalize(input={}){const formality=['neutral','formal','informal'].includes(String(input.formality||'').toLowerCase())?String(input.formality).toLowerCase():'neutral';const locale=/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2}|-[0-9]{3})?$/.test(String(input.locale||''))?String(input.locale).replace(/_/g,'-'):'';return {locale,formality,regionalAdaptationAllowed:!!locale,demographicInferenceAllowed:false,stereotypeInferenceAllowed:false,aggressiveParaphraseAllowed:false,explicitPreferenceRequired:true};}
function getHealth(){return {ok:true,service:'LingoSentinelCulturalContextPolicy',version:VERSION,demographicInferenceAllowed:false,locationInferenceAllowed:false,aggressiveParaphraseAllowed:false};}
module.exports=Object.freeze({VERSION,normalize,getHealth});

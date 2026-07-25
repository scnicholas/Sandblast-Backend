"use strict";

const E=require("./marionNuanceEnvelope.js");
const VERSION="nyx.marion.conversationalSignalNormalizer/1.0",CONTRACT="nyx.marion.nuance.layer21/1.0",LAYER=21;
const RULES=Object.freeze({
 correction:[/\b(?:no|not quite|that(?:'s| is) not|that isn(?:'t|’t)|i meant|what i meant|rather than|instead of|correction|let me correct|you misunderstood|go back|redo|revise|fix that|change that)\b/i],
 continuation:[/\b(?:continue|keep going|go on|next step|what(?:'s| is) next|move on|from there|pick up where|as we discussed|based on that)\b/i],
 validation:[/\b(?:passed|that works|working now|confirmed|validated|approved|looks right|correct|good now|successful|health(?:y)?|ready)\b/i],
 hesitation:[/\b(?:um+|uh+|erm+|hmm+|maybe|perhaps|i think|i suppose|not sure|i guess)\b/i,/(?:\.{3,}|…{1,})/],
 paceSlow:[/\b(?:slow down|piece by piece|step by step|one at a time|take this slowly|pause|hold on)\b/i],
 paceFast:[/\b(?:quickly|right now|immediately|urgent|asap|today|without delay|move fast)\b/i],
 formal:[/\b(?:please|would you|could you|kindly|with respect|regarding|in relation to|therefore|however)\b/i],
 informal:[/\b(?:yeah|yep|nope|gonna|wanna|kinda|sorta|hey|okay|ok|alright)\b/i],
 directive:[/^(?:please\s+)?(?:create|make|fix|address|remove|add|send|resend|build|run|check|review|show|give|tell|update|change|keep|stop|start)\b/i],
 indirect:[/\b(?:would it make sense|do you think|could we|might we|perhaps we should|i wonder if|how about)\b/i],
 switch:[/\b(?:in|into|switch to|translate to|reply in|answer in)\s+(?:english|french|spanish|portuguese|mandarin|chinese|arabic|hindi|punjabi)\b/i,/\b(?:en français|en español|em português)\b/i]
});
function any(text,list){return list.some(rx=>rx.test(text));}
function count(text,rx){const flags=rx.flags.includes("g")?rx.flags:`${rx.flags}g`;const m=text.match(new RegExp(rx.source,flags));return m?m.length:0;}
function words(text){const m=text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);return m?m.length:0;}
function sentences(text){const p=text.split(/[.!?]+/).map(v=>v.trim()).filter(Boolean);return p.length|| (text?1:0);}
function upperRatio(text){const letters=text.match(/\p{L}/gu)||[];if(!letters.length)return 0;return E.clamp01(letters.filter(ch=>ch===ch.toUpperCase()&&ch!==ch.toLowerCase()).length/letters.length);}
function repeatedWords(text){const a=(text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu)||[]),out=[];for(let i=1;i<a.length;i++)if(a[i]===a[i-1]&&a[i].length>1)out.push(a[i]);return E.uniquePrimitiveStrings(out,8,40);}
function scripts(text){const checks=[["Latin",/\p{Script=Latin}/u],["Cyrillic",/\p{Script=Cyrillic}/u],["Greek",/\p{Script=Greek}/u],["Arabic",/\p{Script=Arabic}/u],["Hebrew",/\p{Script=Hebrew}/u],["Han",/\p{Script=Han}/u],["Hiragana",/\p{Script=Hiragana}/u],["Katakana",/\p{Script=Katakana}/u],["Hangul",/\p{Script=Hangul}/u],["Devanagari",/\p{Script=Devanagari}/u]];return checks.filter(([,rx])=>rx.test(text)).map(([name])=>name);}
function declaredLanguage(input){const s=E.safeRecord(input),p=E.safeRecord(s.payload),b=E.safeRecord(s.body),v=E.firstRecord(s.voice,s.voiceEnvelope,p.voice);return E.firstText(s.language,s.languageCode,s.inputLanguage,s.detectedLanguage,p.language,p.languageCode,b.language,b.languageCode,v.language,v.languageCode).slice(0,32);}
function declaredLocale(input){const s=E.safeRecord(input),p=E.safeRecord(s.payload),b=E.safeRecord(s.body),v=E.firstRecord(s.voice,s.voiceEnvelope,p.voice);return E.firstText(s.locale,s.inputLocale,p.locale,b.locale,v.locale).slice(0,32);}
function normalizeConversationalSignals(input={},options={}){
 const text=E.extractCanonicalText(input),wc=words(text),sc=sentences(text),scr=scripts(text),rw=repeatedWords(text),pun={questions:count(text,/\?/),exclamations:count(text,/!/),ellipses:count(text,/(?:\.{3,}|…+)/),dashes:count(text,/(?:—|–|--)/),repeatedPunctuation:count(text,/([!?])\1+/)};
 const correctionMarker=any(text,RULES.correction),continuationMarker=any(text,RULES.continuation),validationMarker=any(text,RULES.validation),hesitationMarker=any(text,RULES.hesitation),pace=any(text,RULES.paceSlow)?"slow_down":any(text,RULES.paceFast)?"accelerate":"steady",formal=RULES.formal.filter(rx=>rx.test(text)).length,informal=RULES.informal.filter(rx=>rx.test(text)).length,formality=formal>informal&&formal?"formal":informal>formal&&informal?"informal":"neutral",directness=any(text,RULES.directive)?"direct":any(text,RULES.indirect)?"indirect":"neutral",ur=upperRatio(text),explicitSwitch=any(text,RULES.switch),multiScript=(scr.includes("Latin")&&scr.length>1)||scr.filter(v=>v!=="Latin").length>1,emphasis=E.clamp01(pun.exclamations*.12+pun.repeatedPunctuation*.18+Math.max(0,ur-.18)*.8+rw.length*.08);
 return {contract:CONTRACT,version:VERSION,layer:LAYER,status:text?"ready":"degraded",available:true,degraded:!text,turnId:E.extractTurnId(input,options.turnId),inputChannel:E.extractInputChannel(input),textMetrics:{characterCount:text.length,wordCount:wc,sentenceCount:sc,averageWordsPerSentence:sc?Number((wc/sc).toFixed(2)):0},punctuation:pun,emphasis:{uppercaseRatio:Number(ur.toFixed(3)),repeatedWords:rw,score:Number(emphasis.toFixed(3))},interactionMarkers:{correctionMarker,continuationMarker,validationMarker,hesitationMarker,explicitQuestion:pun.questions>0,directiveMarker:directness==="direct",indirectRequestMarker:directness==="indirect"},pacing:{signal:pace,abrupt:sc>1&&wc/sc<4,extended:wc>=120,transcriptDisfluencyPossible:hesitationMarker&&E.extractInputChannel(input)==="voice"},register:{formality,directness},languageCompatibility:{explicitLanguage:declaredLanguage(input),explicitLocale:declaredLocale(input),scriptsObserved:scr,explicitLanguageSwitchMarker:explicitSwitch,codeSwitchDetected:explicitSwitch||multiScript,possibleCodeSwitch:explicitSwitch||multiScript,interpretationDeferred:true},safeguards:{observableSignalsOnly:true,emotionalInterpretationPerformed:false,culturalIdentityInferencePerformed:false,psychologicalDiagnosisPerformed:false}};
}
module.exports={VERSION,CONTRACT,LAYER,normalizeConversationalSignals,normalize:normalizeConversationalSignals,analyze:normalizeConversationalSignals,run:normalizeConversationalSignals};

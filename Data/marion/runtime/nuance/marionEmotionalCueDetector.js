"use strict";

const E=require("./marionNuanceEnvelope.js");
const VERSION="nyx.marion.emotionalCueDetector/1.0",CONTRACT="nyx.marion.nuance.layer22/1.0",LAYER=22;
const CUES=Object.freeze({
 calm:{rx:/\b(?:i(?:'m| am) calm|take your time|no rush|that(?:'s| is) fine|all good|steady)\b/i,w:.55},
 focused:{rx:/\b(?:focus on|the goal is|specifically|exactly|the main issue|the priority|let(?:'s| us) address|piece by piece)\b/i,w:.42},
 uncertain:{rx:/\b(?:not sure|i don(?:'t|’t) know|maybe|perhaps|i think|could be|might be|do you think|would it make sense)\b/i,w:.48},
 concerned:{rx:/\b(?:concerned|worried|risk|problem|issue|careful|make sure|don(?:'t|’t) want|avoid)\b/i,w:.44},
 frustration_possible:{rx:/\b(?:frustrat(?:ed|ing)|annoy(?:ed|ing)|this keeps|still not|again|not what i meant|you misunderstood|doesn(?:'t|’t) work|failed again)\b/i,w:.55},
 disappointed:{rx:/\b(?:disappointed|let down|expected better|not good enough|unfortunate|that(?:'s| is) disappointing)\b/i,w:.58},
 urgent:{rx:/\b(?:urgent|immediately|right now|asap|today|deadline|without delay|critical|emergency)\b/i,w:.62},
 overwhelmed:{rx:/\b(?:overwhelmed|too much|can(?:'t|not) keep up|one thing at a time|slow down|this is a lot|too many)\b/i,w:.60},
 reflective:{rx:/\b(?:i(?:'ve| have) been thinking|looking back|in retrospect|what does this mean|let(?:'s| us) consider|reflect|from a broader perspective)\b/i,w:.45},
 playful:{rx:/\b(?:just kidding|kidding|lol|haha|funny|joking|teasing)\b/i,w:.55},
 guarded:{rx:/\b(?:i(?:'m| am) not comfortable|keep this private|don(?:'t|’t) share|careful what|i(?:'d| would) rather not|not ready to say)\b/i,w:.62},
 enthusiastic:{rx:/\b(?:excited|excellent|great work|love it|fantastic|amazing|this is great|let(?:'s| us) do it|ready to go)\b/i,w:.54}
});
const SELF=Object.freeze({calm:/\bi\s*(?:am|'m)\s+calm\b/i,focused:/\bi\s*(?:am|'m)\s+focused\b/i,uncertain:/\bi\s*(?:am|'m)\s+(?:uncertain|not sure)\b/i,concerned:/\bi\s*(?:am|'m)\s+(?:concerned|worried)\b/i,frustration_possible:/\bi\s*(?:am|'m)\s+frustrated\b/i,disappointed:/\bi\s*(?:am|'m)\s+disappointed\b/i,urgent:/\bthis\s+is\s+urgent\b/i,overwhelmed:/\bi\s*(?:am|'m)\s+overwhelmed\b/i,reflective:/\bi\s*(?:am|'m)\s+reflecting\b/i,playful:/\bi\s*(?:am|'m)\s+(?:joking|kidding)\b/i,guarded:/\bi\s*(?:am|'m)\s+(?:guarded|not comfortable)\b/i,enthusiastic:/\bi\s*(?:am|'m)\s+(?:excited|enthusiastic)\b/i});
function add(arr,v){if(!arr.includes(v))arr.push(v);}
function adjust(state,signals){const s=E.safeRecord(signals),p=E.safeRecord(s.punctuation),e=E.safeRecord(s.emphasis),m=E.safeRecord(s.interactionMarkers),pace=E.safeRecord(s.pacing);let score=0;const evidence=[];
 if(state==="frustration_possible"){if(m.correctionMarker){score+=.2;add(evidence,"explicit_or_repeated_correction");}if(Number(p.repeatedPunctuation)>0){score+=.1;add(evidence,"repeated_punctuation");}if(Number(e.score)>=.35){score+=.08;add(evidence,"elevated_emphasis");}}
 if(state==="focused"){if(m.directiveMarker){score+=.16;add(evidence,"directive_structure");}if(pace.signal==="slow_down"){score+=.12;add(evidence,"deliberate_pacing_request");}}
 if(state==="uncertain"){if(m.hesitationMarker){score+=.22;add(evidence,"hesitation_marker");}if(m.indirectRequestMarker){score+=.1;add(evidence,"indirect_request");}}
 if(state==="urgent"){if(pace.signal==="accelerate"){score+=.28;add(evidence,"accelerated_pacing_request");}if(Number(p.exclamations)>1){score+=.08;add(evidence,"multiple_exclamations");}}
 if(state==="overwhelmed"&&pace.signal==="slow_down"){score+=.18;add(evidence,"slow_down_request");}
 if(state==="enthusiastic"&&m.validationMarker&&Number(p.exclamations)>0){score+=.18;add(evidence,"positive_validation_with_emphasis");}
 if(state==="calm"&&Number(p.repeatedPunctuation)===0&&Number(e.score)<.15&&pace.signal==="steady"&&s.status==="ready"){score+=.12;add(evidence,"low_intensity_delivery");}
 if(state==="reflective"&&Number(E.safeRecord(s.textMetrics).wordCount)>=35){score+=.1;add(evidence,"extended_exploratory_turn");}
 return {score,evidence};}
function detectEmotionalCues(input={},normalizedSignals={},options={}){
 const text=E.extractCanonicalText(input),candidates=[];
 for(const [state,rule] of Object.entries(CUES)){
  let score=0;const evidence=[];
  if(rule.rx.test(text)){score+=rule.w;add(evidence,`phrase_${state}`);}
  const a=adjust(state,normalizedSignals);score+=a.score;a.evidence.forEach(v=>add(evidence,v));
  const selfDeclared=!!(SELF[state]&&SELF[state].test(text));if(selfDeclared){score+=.28;add(evidence,"explicit_self_declaration");}
  if(score>0)candidates.push({state,confidence:Number(E.clamp01(score).toFixed(3)),selfDeclared,evidence:E.uniquePrimitiveStrings(evidence,10,80),interpretation:"candidate_conversational_state"});
 }
 candidates.sort((a,b)=>b.confidence-a.confidence||a.state.localeCompare(b.state));
 const top=candidates.slice(0,3),primaryCandidate=top[0]||{state:"undetermined",confidence:0,selfDeclared:false,evidence:[],interpretation:"insufficient_evidence"};
 return {contract:CONTRACT,version:VERSION,layer:LAYER,status:text?"ready":"degraded",available:true,degraded:!text,turnId:E.extractTurnId(input,options.turnId),primaryCandidate,candidates:top,signalCount:top.reduce((sum,item)=>sum+item.evidence.length,0),safeguards:{probabilisticOnly:true,noPsychologicalDiagnosis:true,noStablePersonalityInference:true,noIdentityInference:true,rawTextStored:false,userCorrectionCanOverride:true}};
}
module.exports={VERSION,CONTRACT,LAYER,STATES:Object.freeze(Object.keys(CUES)),detectEmotionalCues,detect:detectEmotionalCues,analyze:detectEmotionalCues,run:detectEmotionalCues};

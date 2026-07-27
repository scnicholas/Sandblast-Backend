"use strict";
const assert=require("assert");
const path=require("path");
const root=path.resolve(__dirname,"..");
const composer=require(path.join(root,"Data/marion/runtime/composeMarionResponse.js"));
const bridge=require(path.join(root,"Data/marion/runtime/marionBridge.js"));
const progression=require(path.join(root,"Data/marion/runtime/marionConversationProgression.js"));
const depth=require(path.join(root,"Data/marion/runtime/MarionConversationalDepth678.js"));
const state=require(path.join(root,"utils/stateSpine.js"));
const chat=require(path.join(root,"utils/chatEngine.js"));
const auditor=require(path.join(root,"Data/marion/runtime/metacognition/marionReasoningAuditor.js"));
const calibrator=require(path.join(root,"Data/marion/runtime/metacognition/marionQualityCalibrator.js"));
const planner=require(path.join(root,"Data/marion/runtime/strategy/marionStrategicPlanner.js"));
const arbitrator=require(path.join(root,"Data/marion/runtime/strategy/marionPriorityArbitrator.js"));
const prompts=[
 ["3.1","Earlier you recommended A. I've now discovered evidence supporting B. Walk me through how your recommendation changes."],
 ["3.2","Which part of your recommendation are you most confident about, and which part is the most uncertain?"],
 ["3.3","I have three possible ways forward. Help me choose."],
 ["3.4","I'm missing several important facts. How do you proceed?"],
 ["3.5","List every assumption you're making before answering."]
];
(async()=>{let passed=0;for(const [id,prompt] of prompts){
 const c=composer.classifyRound3CognitiveResilience(prompt);assert(c&&c.test===id);passed++;
 const cr=await composer.composeMarionResponse({prompt});assert(cr.final===true&&cr.hardStopLayer===28&&cr.executionAuthorized===false&&cr.reply.length>80);passed++;
 const br=await bridge.processWithMarion({prompt});assert(br.final===true&&br.finalEnvelope.signature==="MARION_FINAL_AUTHORITY"&&br.cognitiveResilience.test===id);passed++;
 const ce=await chat.processWithMarion?.({prompt})||await chat.handle?.({prompt})||await chat.run?.({prompt});assert(ce&&ce.final===true&&ce.executionAuthorized===false);passed++;
 const pg=progression.analyzeTurn({prompt,previous:{stage:"analysis",progressionDepth:1}});assert(pg.stage===c.stage&&pg.singlePass===true);passed++;
 }
 const audit=auditor.resilienceAudit({evidence:[{source:"A"}],assumptions:["Demand remains stable"],alternatives:["A","B"],confidence:.7});assert(audit.executionAuthorized===false&&audit.currentEvidenceWins===true);passed++;
 const cal=calibrator.calibrateResilience({reply:"The recommendation changes because new evidence is stronger; assumptions and confidence are explicit.",conflictingEvidence:true,assumptionAuditRequired:true});assert(cal.approved===true);passed++;
 const plan=planner.planResilient({prompt:"Choose",options:[{id:"a",risk:.2},{id:"b",risk:.5}],assumptions:["budget fixed"],missingFacts:["timeline"]});assert(plan.executionAuthorized===false&&plan.options.length===2);passed++;
 const rank=arbitrator.arbitrateEvidence({candidates:[{id:"old",reliability:.5,relevance:.7,recency:.2},{id:"new",reliability:.9,relevance:.9,recency:1}]});assert(rank.winner.id==="new"&&rank.executionAuthorized===false);passed++;
 console.log(JSON.stringify({ok:true,assertionsPassed:passed,tests:prompts.length,hardStopLayer:28,executionAuthorized:false},null,2));
})().catch(err=>{console.error(err);process.exit(1)});

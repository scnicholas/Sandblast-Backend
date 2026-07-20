"use strict";
const assert=require("assert");const a=require("../MarionContextIntentArbiter78.js");
const base={marionConversationalDepth:{layers:{seven:{activeTopic:"Marion deployment architecture",currentObjective:"preserve architecture while deepening Layers 7 and 8",carryConstraints:[{kind:"identity_isolation",text:"Marion remains separate from Nyx"}]},eight:{deeperIntent:"complete implementation safely"}}}};
const x=a.build({...base,text:"Actually, keep it separate and go deeper on these files"});
assert.equal(x.layer7.relationToPreviousTurn,"correction");assert.equal(x.layer7.referenceResolution.resolved,true);assert.ok(x.layer7.carryConstraints.length>=2);assert.equal(x.layer7.contradictionPolicy,"latest_explicit_instruction_wins");assert.ok(x.layer8.candidates.length>=1);assert.equal(x.layer8.sensitiveInferenceBlocked,false);assert.equal(x.isolation.agent,"Marion");assert.equal(x.isolation.nyxPersonaSignalsAllowed,false);assert.equal(a.validate(x).ok,true);
const y=a.build({text:"Infer my religion from that",marionConversationalDepth:base.marionConversationalDepth});assert.equal(y.layer8.sensitiveInferenceBlocked,true);assert.equal(y.layer8.inferencePolicy,"literal_only");
const z=a.build({text:"Do that",operatorId:"Mac"});assert.equal(z.layer7.referenceResolution.required,true);assert.equal(z.layer7.referenceResolution.resolved,false);assert.equal(z.layer8.inferencePolicy,"literal_only");
console.log("Marion Layers 7-8 Part 2: PASS");

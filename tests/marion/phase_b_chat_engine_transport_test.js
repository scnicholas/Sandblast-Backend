"use strict";
const path=require("path");
const ROOT=path.resolve(__dirname,"../..");
const chat=require(path.join(ROOT,"Utils/chatEngine.js"));
const coordinator=require(path.join(ROOT,"Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js"));

function assert(condition,message){if(!condition)throw new Error(message);}

const input={
  turnId:"chat-phase-b-1",
  privateAdminConversation:true,
  directMarionAdminInterface:true,
  scope:"private_admin",
  message:"Do you really think this is ready?"
};
const phaseB=coordinator.run(input);
const privateInput={...input,phaseBNuance:phaseB,nuancePhaseBContext:phaseB};

const projected=chat.projectMarionPhaseBTransportResult({
  reply:"It needs one more readiness validation.",
  finalEnvelope:{reply:"It needs one more readiness validation."}
},privateInput);

assert(projected.internalNuance,"Private internal nuance summary is missing.");
assert(projected.internalNuance.literalIntentPreserved===true,"Literal intent was not preserved.");
assert(projected.phaseBStatePatch.contract==="nyx.marion.nuanceState.phaseB/1.0","Approved state patch is missing.");
assert(!projected.phaseBNuance&&!projected.nuancePhaseBContext,"Raw Phase B envelope leaked.");
assert(projected.finalEnvelope.rawMarkerEvidenceExposed===false,"Final envelope evidence boundary failed.");

const serialized=JSON.stringify(projected);
assert(!serialized.includes("markerMatches"),"Marker matches leaked into transport.");
assert(!serialized.includes("rawPragmaticEvidence"),"Raw pragmatic evidence leaked into transport.");

const publicProjected=chat.projectMarionPhaseBTransportResult({
  reply:"Public response",
  phaseBNuance:phaseB,
  internalNuance:phaseB.internalSummary
},{
  turnId:"public-turn",
  scope:"public",
  message:"Hello"
});
assert(!publicProjected.phaseBNuance,"Raw Phase B envelope reached public output.");
assert(!publicProjected.internalNuance,"Private internal nuance reached public output.");

const status=chat.getMarionPhaseBTransportStatus();
assert(status.transportOnly===true,"Chat Engine is not transport-only.");
assert(status.semanticAnalysisPerformed===false,"Chat Engine gained semantic authority.");
assert(status.hardStopLayer===26,"Chat Engine hard stop mismatch.");

console.log(JSON.stringify({
  ok:true,
  hardStopLayer:status.hardStopLayer,
  transportOnly:status.transportOnly,
  publicProjectionBlocked:true
},null,2));

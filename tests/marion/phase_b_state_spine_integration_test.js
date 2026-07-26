"use strict";
const path=require("path");
const ROOT=path.resolve(__dirname,"../..");
const state=require(path.join(ROOT,"Utils/stateSpine.js"));

function assert(condition,message){if(!condition)throw new Error(message);}

const status=state.getMarionNuancePhaseBStateStatus();
assert(status.hardStopLayer===26,"State Spine hard stop must be 26.");
assert(status.stanceTtlTurns===2,"Stance TTL must be two turns.");
assert(status.pragmaticIntentTtlTurns===1,"Pragmatic intent TTL must be one turn.");
assert(status.rawMarkerEvidenceCarryAllowed===false,"Raw marker evidence must be blocked.");

const approved={
  contract:"nyx.marion.nuanceState.phaseB/1.0",
  revision:2,
  lastUpdatedTurnId:"state-turn-1",
  lastInteractionState:"validation",
  interactionStateTtlTurns:3,
  emotionalCandidate:"focused",
  emotionalConfidence:.72,
  emotionalCueTtlTurns:1,
  lastStance:"validating",
  stanceConfidence:.88,
  stanceTtlTurns:2,
  pragmaticIntent:"request_for_validation",
  pragmaticIntentConfidence:.81,
  pragmaticIntentTtlTurns:1,
  scope:"private_admin",
  partitionClass:"private_admin",
  rawMarkerEvidence:["must_not_persist"],
  policies:{rawMarkerEvidenceCarryAllowed:true}
};

const merged=state.mergeMarionNuancePhaseBState(
  {},
  approved,
  "private_admin",
  "state-turn-1"
);
assert(merged.lastStance==="validating","Approved stance was not carried.");
assert(merged.pragmaticIntent==="request_for_validation","Approved pragmatic intent was not carried.");
assert(!Object.prototype.hasOwnProperty.call(merged,"rawMarkerEvidence"),"Raw evidence leaked into state.");
assert(merged.policies.rawMarkerEvidenceCarryAllowed===false,"Raw marker evidence policy was weakened.");

const decayed=state.decayMarionNuancePhaseBState(merged);
assert(decayed.stanceTtlTurns===1,"Stance did not decay.");
assert(decayed.pragmaticIntentTtlTurns===0,"Pragmatic intent did not decay.");
assert(decayed.pragmaticIntent==="","Expired pragmatic intent was retained.");

const publicState=state.mergeMarionNuancePhaseBState(
  merged,
  approved,
  "public",
  "state-turn-1"
);
assert(publicState.partitionClass==="public","Public partition was not enforced.");
assert(publicState.lastStance==="","Private stance crossed into public state.");
assert(publicState.pragmaticIntent==="","Private pragmatic intent crossed into public state.");

const corrected=state.applyMarionNuancePhaseBState(
  {nuanceState:merged},
  {
    privateAdminConversation:true,
    turnId:"state-turn-2",
    internalNuance:{
      contract:"nyx.marion.nuance.phaseB/1.0",
      interactionState:"correction",
      primaryPragmaticIntent:"direct_correction"
    }
  }
);
assert(corrected.nuanceState.emotionalCandidate==="","Correction did not clear emotional carry.");
assert(corrected.nuanceState.pragmaticIntent==="","Correction did not clear pragmatic carry.");

console.log(JSON.stringify({
  ok:true,
  hardStopLayer:status.hardStopLayer,
  partitionBoundary:true,
  correctionPrecedence:true
},null,2));

"use strict";
const path=require("path"),ROOT=path.resolve(__dirname,"../..");
const B=require(path.join(ROOT,"Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js"));
const current=require(path.join(ROOT,"Data/marion/runtime/marionCurrentTurnAuthority.js"));
const bridge=require(path.join(ROOT,"Data/marion/runtime/marionBridge.js"));
function a(x,m){if(!x)throw new Error(m);}
const input={turnId:"b1-current",privateAdminConversation:true,directMarionAdminInterface:true,scope:"private_admin",message:"No, correct the route first."};
const b=B.run(input);
const prepared=current.prepareInput({...input,phaseBNuance:b,nuanceContext:b.phaseA});
a(prepared.phaseBNuanceCurrentTurnVerified===true,"current turn verify");
a(prepared.phaseBCorrectionOverride===true,"correction precedence");
a(current.MARION_LAYER_HARD_STOP===26,"current hard stop");
a(bridge.MARION_LAYER_HARD_STOP===26,"bridge hard stop");
const status=bridge.getMarionNuancePhaseBStatus();
a(status.phaseACalledOnce===true,"phase A once");
console.log(JSON.stringify({ok:true,hardStop:status.hardStopLayer}));

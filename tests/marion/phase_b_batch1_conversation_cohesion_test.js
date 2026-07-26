"use strict";
const path=require("path"),ROOT=path.resolve(__dirname,"../..");
const B=require(path.join(ROOT,"Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js"));
const registry=require(path.join(ROOT,"Data/marion/runtime/conversation/marionConversationLayerRegistry.js"));
function a(x,m){if(!x)throw new Error(m);}
const input={turnId:"b1-conv",privateAdminConversation:true,directMarionAdminInterface:true,scope:"private_admin",message:"No, that is not what I meant. Fix the current section first."};
const phaseB=B.run(input);
const flow=registry.analyzeTurn({...input,phaseBNuance:phaseB,nuanceContext:phaseB.phaseA},{},{});
a(flow.hardStopLayer===26,"hard stop");
a(flow.phaseBPrimaryPragmaticIntent==="direct_correction","pragmatic correction");
a(flow.literalIntentPreserved===true,"literal intent");
a(flow.automaticExecutionAllowed===false,"execution boundary");
console.log(JSON.stringify({ok:true,hardStop:flow.hardStopLayer,pragmatic:flow.phaseBPrimaryPragmaticIntent}));

"use strict";
const path=require("path"),ROOT=path.resolve(__dirname,"../..");
const B=require(path.join(ROOT,"Data/marion/runtime/nuance/marionNuancePhaseBCoordinator.js"));
function assert(v,m){if(!v)throw new Error(m);}
const text=B.run({turnId:"text-parity",inputChannel:"text",message:"No, that is not what I meant. Slow down and correct the current section."});
const voice=B.run({turnId:"voice-parity",inputChannel:"voice",transcript:"No no that is not what I meant slow down and correct the current section"});
assert(text.layer25.primaryStance===voice.layer25.primaryStance,"Voice/text stance parity drift.");
assert(text.layer26.primaryPragmaticIntent===voice.layer26.primaryPragmaticIntent,"Voice/text pragmatic parity drift.");
assert(voice.inputChannel==="voice","Voice channel was not preserved.");
console.log(JSON.stringify({ok:true,stance:text.layer25.primaryStance,pragmatic:text.layer26.primaryPragmaticIntent},null,2));

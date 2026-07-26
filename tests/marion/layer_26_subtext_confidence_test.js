"use strict";
const path=require("path"),ROOT=path.resolve(__dirname,"../..");
const G=require(path.join(ROOT,"Data/marion/runtime/nuance/marionSubtextConfidenceGate.js"));
function assert(v,m){if(!v)throw new Error(m);}
let r=G.run({confidence:.32,primaryPragmaticIntent:"skepticism",secondaryPragmaticIntents:[],figurativeFlags:[],ambiguity:"low"});
assert(r.subtextPolicy==="literal_only","Low confidence did not remain literal-only.");
r=G.run({confidence:.58,primaryPragmaticIntent:"request_for_validation",secondaryPragmaticIntents:[],figurativeFlags:[],ambiguity:"medium"});
assert(r.subtextPolicy==="literal_plus_cautious_pragmatic_response","Medium confidence policy mismatch.");
r=G.run({confidence:.74,primaryPragmaticIntent:"skepticism",secondaryPragmaticIntents:[],figurativeFlags:["sarcasm_possible"],ambiguity:"low"});
assert(r.figurativeInterpretationAllowed===false,"Sarcasm was accepted below the strict threshold.");
assert(r.blockedFigurativeFlags.includes("sarcasm_possible"),"Blocked sarcasm flag missing.");
r=G.run({confidence:.86,primaryPragmaticIntent:"skepticism",secondaryPragmaticIntents:[],figurativeFlags:["sarcasm_possible"],ambiguity:"low"});
assert(r.figurativeInterpretationAllowed===true,"High-confidence figurative interpretation was not allowed.");
assert(r.literalIntentPreserved===true,"Literal intent was not preserved.");
console.log(JSON.stringify({ok:true,policy:r.subtextPolicy},null,2));

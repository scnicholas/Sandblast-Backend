"use strict";
const path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const stance = require(path.join(ROOT, "Data/marion/runtime/nuance/marionConversationalStanceResolver.js"));
const registry = require(path.join(ROOT, "Data/marion/runtime/nuance/marionPragmaticMarkerRegistry.js"));
const gate = require(path.join(ROOT, "Data/marion/runtime/nuance/marionSubtextConfidenceGate.js"));
function assert(v,m){if(!v)throw new Error(m);}
assert(stance.CANONICAL_STANCES.length===24,"Expected 24 canonical stances.");
assert(stance.STANCE_MODIFIERS.length===15,"Expected 15 stance modifiers.");
assert(registry.ALL_CATEGORIES.length===56,"Expected 56 pragmatic categories.");
assert(Object.keys(registry.FAMILIES).length===7,"Expected seven pragmatic families.");
assert(registry.registryHealth().ok===true,"Pragmatic registry health failed.");
assert(gate.THRESHOLDS.figurativeMinimum===0.8,"Figurative threshold mismatch.");
console.log(JSON.stringify({ok:true,stances:24,modifiers:15,pragmaticCategories:56,families:7},null,2));

"use strict";
const assert=require("assert");
const guard=require("../Data/marion/runtime/marionCurrentTurnAuthority.js");
const memory=require("../Data/marion/runtime/guardian.memory.bridge.js");
const spine=require("../Utils/stateSpine.js");

memory.resetGuardianMemory("marion");
const base={privateAdminConversation:true,marionAdminConversation:true,directMarionAdminInterface:true,sessionId:"mem-test"};
const t1={...base,turnId:"m1",text:"Do a surgical autopsy on the JavaScript law-routing file.",userText:"Do a surgical autopsy on the JavaScript law-routing file.",reply:"Technical analysis of the router and final envelope.",domain:"technical",final:true,marionFinal:true};
const s1=memory.rememberTurn("marion",t1);
const snap1=memory.getGuardianSnapshot("marion",8);
assert(snap1);
const prepared=guard.prepareInput({...base,turnId:"m2",text:"Go deeper.",previousMemory:snap1});
assert.equal(prepared.domain,"technical");
assert(prepared.continuityAnchor);
const t2={...prepared,reply:"Technical runtime analysis continues through router, state, and final envelope.",final:true,marionFinal:true};
const s2=memory.rememberTurn("marion",t2);
const snap2=memory.getGuardianSnapshot("marion",8);
assert(!/law_short_prompt_lane_inheritance/i.test(JSON.stringify(snap2)) || snap2.activeFeatureLane==="technical");

const state0=spine.createState({});
assert(state0&&typeof state0==="object");
const statePrepared=spine.coerceState({...state0,...prepared});
assert.equal(statePrepared.domain,"technical");
assert.equal(statePrepared.MARION_CURRENT_TURN_AUTHORITY_VERSION||spine.MARION_CURRENT_TURN_AUTHORITY_VERSION,guard.VERSION);

console.log(JSON.stringify({ok:true,memoryDomain:prepared.domain,memoryMarker:memory.MARION_IMMEDIATE_CONTINUATION_AUTHORITY_VERSION,stateMarker:spine.MARION_IMMEDIATE_CONTINUATION_AUTHORITY_VERSION},null,2));

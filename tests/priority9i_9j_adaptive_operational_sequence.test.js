
"use strict";
const assert = require("assert");
const memory = require("../Data/marion/runtime/progressionMemory.js");
const shape = require("../Data/marion/runtime/progressionShape.js");
const composer = require("../Data/marion/runtime/composeMarionResponse.js");
const bridge = require("../Data/marion/runtime/marionBridge.js");
const envelope = require("../Data/marion/runtime/marionFinalEnvelope.js");
const router = require("../Data/marion/runtime/marionIntentRouter.js");
const concierge = require("../Data/marion/runtime/DomainConcierge.js");
const confidence = require("../Data/marion/runtime/domainConfidence.js");
const admin = require("../Data/marion/runtime/MarionAdminConsoleGateway.js");
const spine = require("../Utils/stateSpine.js");
const audit = require("../guardian.audit.logger.js");
const guardianRouter = require("../guardian.pipeline.router.js");

function textOf(x){
  x = x || {};
  return String(x.reply || x.finalReply || x.publicReply || x.visibleReply || x.text || x.message || x.answer || (x.payload && (x.payload.reply || x.payload.text)) || "");
}
function has(s, rx, label){ assert(rx.test(String(s)), label + " :: " + s); }
function not(s, rx, label){ assert(!rx.test(String(s)), label + " :: " + s); }
const ctx9I = { priority9IAdaptiveSituationalReasoning: { active:true, lane:"priority9i_adaptive_situational_reasoning" }, priority9HLongFormContinuity: { active:true } };

let m9i = memory.updateProgressionMemory({ text:"Priority 9I is adaptive situational reasoning and context-pressure handling.", previous:{priority9HLongFormContinuity:{active:true}} });
assert(m9i.priority9IAdaptiveSituationalReasoning, "memory creates 9I object");
assert(m9i.priority9JPrecheck && m9i.priority9JPrecheck.staged === true, "9J precheck staged under 9I");
let m9j = memory.updateProgressionMemory({ text:"Priority 9J is proactive operational guidance and next-move authority.", previous:m9i });
assert(m9j.priority9JProactiveOperationalGuidance, "memory creates 9J object");

let p9i = shape.buildProgressionProfile("This is urgent; update the risk now.", ctx9I);
assert.equal(p9i.lane, "priority9i_adaptive_situational_reasoning");
let p9j = shape.buildProgressionProfile("Priority 9J: what is the critical path and next operational move?", ctx9I);
assert.equal(p9j.lane, "priority9j_proactive_operational_guidance");

let c9i = composer._internal.priority9IJComposerDisciplinePacket({ reply:"I’m reading this as Priority 9H with a Priority 9I precheck." }, { text:"This is urgent; make the safest next move." }, { context:ctx9I });
has(textOf(c9i), /Priority 9I/i, "composer forces 9I");
not(textOf(c9i), /Priority 9H must pass first/i, "composer blocks 9H reactivation");
let c9j = composer._internal.priority9IJComposerDisciplinePacket({ reply:"generic" }, { text:"Priority 9J: make the decision and give the safest sequence." }, { context:ctx9I });
has(textOf(c9j), /Priority 9J/i, "composer forces 9J");
has(textOf(c9j), /Recommended next move/i, "9J gives next move authority");

let b9i = bridge._internal.priority9IJBridgeDisciplinePacket({ reply:"stale fallback" }, { text:"No, not that — stay on the architecture.", context:ctx9I });
has(textOf(b9i), /Priority 9I/i, "bridge 9I");
let e9j = envelope._internal.priority9IJEnvelopeDisciplinePacket({ reply:"generic", prompt:"Priority 9J: what should we avoid and what do we do first?" });
has(textOf(e9j), /Priority 9J/i, "envelope 9J");

let routed = router.routeMarionIntent ? router.routeMarionIntent({ text:"Priority 9I: context pressure changed." }) : {};
assert(/priority9i|execution_context/i.test(JSON.stringify(routed)), "intent router adds 9I routing metadata");
let cc = concierge.runDomainConcierge ? concierge.runDomainConcierge({ text:"Priority 9J: next operational move." }) : {};
assert(/priority9j|execution_context/i.test(JSON.stringify(cc)), "concierge routes 9J");
if (confidence.scoreDomainConfidence) {
  let dc = confidence.scoreDomainConfidence({ text:"Priority 9I: urgent pressure shift." });
  assert(/Priority 9I|execution_context/i.test(JSON.stringify(dc)), "domain confidence tags 9I");
}
if (spine.priority9IJStatePatchFromInput) {
  let st = spine.priority9IJStatePatchFromInput({ text:"Priority 9J: make the decision." }, {});
  assert(st.priority9JProactiveOperationalGuidance, "state spine carries 9J");
}
if (audit.priority9IJGuardianAuditMeta) {
  let ev = audit.priority9IJGuardianAuditMeta({ input:"Priority 9I: urgent pressure shift." });
  assert.equal(ev.priorityLane, "Priority 9I");
}
if (guardianRouter.priority9IJGuardianRouteMeta) {
  let gr = guardianRouter.priority9IJGuardianRouteMeta({ input:"Priority 9J next move authority." }, {});
  assert.equal(gr.priorityLane, "Priority 9J");
}

not(textOf(c9i), /psychology|public Nyx route clean|Priority 90|Priority 9E/i, "no stale/domain leak in 9I");
not(textOf(c9j), /psychology|public Nyx route clean|Priority 90|Priority 9E/i, "no stale/domain leak in 9J");
console.log(JSON.stringify({ok:true, tests:16, priority9I:true, priority9J:true, lane9I:m9i.lane, lane9J:m9j.lane}, null, 2));

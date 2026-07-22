"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const router = require(path.join(root, "Data/marion/runtime/marionIntentRouter.js"));
const chat = require(path.join(root, "Utils/chatEngine.js"));
const indexText = fs.readFileSync(path.join(root, "index.js"), "utf8");

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  if (!pass) process.exitCode = 1;
}
function privateInput(prompt, sessionId, extra) {
  return Object.assign({
    prompt, userText: prompt, text: prompt,
    sessionId,
    conversationId: sessionId,
    marionAdminConversation: true,
    privateAdminConversation: true,
    directMarionAdminInterface: true,
    adminVerified: true
  }, extra || {});
}

const sid = "smoke-technical-v5";
const sequence = [
  ["Do a surgical autopsy on the JavaScript law-routing file.", { newSession: true }],
  ["Go deeper.", {}],
  ["What should be fixed first?", {}],
  ["What is the safest implementation order?", {}],
  ["How do we validate the repair?", {}],
  ["What happens after that?", {}]
];
const routed = sequence.map(([prompt, extra]) =>
  router.routeMarionIntent(privateInput(prompt, sid, extra))
);
check(
  "router_long_technical_sequence",
  routed.every((x) => x && x.routing && x.routing.domain === "technical" && x.marionIntent && x.marionIntent.intent === "technical_debug"),
  routed.map((x) => x && x.routing && x.routing.domain).join(",")
);

const legal = router.routeMarionIntent(privateInput(
  "Can you review the legal risks in this contract?",
  sid
));
check(
  "router_legitimate_law_preserved",
  legal && legal.routing && legal.routing.domain === "law",
  legal && legal.routing && legal.routing.domain
);

const freshSid = "smoke-fresh-v5";
router.routeMarionIntent(privateInput("Hello Marion.", freshSid, { newSession: true }));
const noAnchor = router.routeMarionIntent(privateInput("Go deeper.", freshSid));
check(
  "router_fresh_session_no_technical_inheritance",
  !(noAnchor && noAnchor.routing && noAnchor.routing.domain === "technical"),
  noAnchor && noAnchor.routing && noAnchor.routing.domain
);

const lawReply = "I can give general legal-risk triage, not legal advice. Legal category: general/legal/risk. Jurisdiction sensitivity: governing jurisdiction required.";
chat.projectMarionPrivateTechnicalFinalMismatch(
  { reply: "The router must bind the current technical task before stale law metadata is evaluated.", domain: "technical" },
  privateInput(sequence[0][0], "chat-v5", { newSession: true })
);
const recovered = chat.projectMarionPrivateTechnicalFinalMismatch(
  {
    reply: lawReply,
    displayReply: lawReply,
    domain: "law",
    routing: { domain: "law" },
    result: {
      candidateReply: "Validate the repair with a fresh session, six technical follow-ups, explicit lane-exit tests, and matching final reply aliases."
    }
  },
  privateInput("How do we validate the repair?", "chat-v5")
);
check(
  "chat_semantic_mismatch_recovers_existing_technical_candidate",
  recovered && recovered.domain === "technical" &&
    /fresh session/i.test(recovered.reply || "") &&
    recovered.meta && recovered.meta.semanticHealth === "recovered",
  recovered && recovered.reply
);

const suppressed = chat.projectMarionPrivateTechnicalFinalMismatch(
  { reply: lawReply, domain: "law", routing: { domain: "law" } },
  privateInput("What is the safest implementation order?", "chat-v5")
);
check(
  "chat_semantic_mismatch_suppresses_when_no_technical_candidate",
  suppressed && suppressed.suppressUserFacingReply === true &&
    suppressed.failureSignature === "ROUTE_DOMAIN_MISMATCH",
  JSON.stringify({
    suppressUserFacingReply: suppressed && suppressed.suppressUserFacingReply,
    failureSignature: suppressed && suppressed.failureSignature
  })
);

const publicPacket = { reply: lawReply, domain: "law" };
const publicResult = chat.projectMarionPrivateTechnicalFinalMismatch(
  publicPacket,
  { prompt: "How do we validate the repair?", source: "nyx-public", lane: "public" }
);
check(
  "chat_public_nyx_noop",
  publicResult === publicPacket && publicResult.domain === "law",
  publicResult && publicResult.domain
);

check(
  "index_canonical_bridge_path_first",
  indexText.indexOf('"./Data/marion/runtime/marionBridge.js"') <
    indexText.indexOf('"./marionBridge.js"'),
  "canonical Data/marion/runtime path precedes root fallback"
);
check(
  "index_processWithMarion_preferred",
  indexText.indexOf('typeof bridgeStatus.mod.processWithMarion === "function" ? bridgeStatus.mod.processWithMarion') >= 0,
  "canonical processWithMarion selection present"
);
check(
  "index_widget_session_id_preserved",
  indexText.indexOf('body && (body.sessionId || body.conversationId)') >= 0 &&
    indexText.indexOf('conversationId: cleanText(body && (body.conversationId || body.sessionId)') >= 0,
  "widget sessionId/conversationId retained"
);
check(
  "index_terminal_hardlock_uses_canonical_invoke",
  indexText.indexOf('const runtime=await invokeMarionAdminTextRuntime(') >= 0 &&
    indexText.indexOf('canonicalBridgeInvoked:true') >= 0,
  "terminal hardlock invokes canonical bridge path"
);
check(
  "version_markers_present",
  router.MARION_PRIVATE_CONTEXTUAL_ENGINEERING_ROUTER_VERSION === "nyx.marion.privateContextualEngineeringRouter/5.0" &&
    chat.MARION_PRIVATE_TECHNICAL_FINAL_MISMATCH_GATE_VERSION === "marion.chatEngine.privateTechnicalFinalMismatchGate/5.0" &&
    indexText.includes("marion.privateRuntime.canonicalSemanticShield/5.0"),
  "v5 markers"
);

console.log(JSON.stringify({
  ok: results.every((r) => r.pass),
  testCount: results.length,
  passed: results.filter((r) => r.pass).length,
  failed: results.filter((r) => !r.pass).length,
  results
}, null, 2));

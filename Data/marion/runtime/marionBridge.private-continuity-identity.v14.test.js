"use strict";

const bridge = require("./Data/marion/runtime/marionBridge.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replyOf(o) {
  if (!o) return "";
  return String(
    o.directReply ??
    o.visibleReply ??
    o.displayReply ??
    o.finalReply ??
    o.reply ??
    o.text ??
    ""
  ).trim();
}

function input(prompt, sessionId, turn) {
  return {
    prompt,
    sessionId,
    turn,
    privateAdminConversation: true,
    marionAdminConversation: true,
    directMarionAdminInterface: true,
    authenticatedOperator: true,
    adminVerified: true,
    serverSideAdminAuth: true,
    scope: "private_admin",
    testMode: true,
    round: "V14"
  };
}

(async () => {
  assert(
    typeof bridge.handleMarionAdminConversation === "function",
    "handleMarionAdminConversation missing"
  );

  const contract = bridge.getPrivateContinuityIdentityRecoveryContract();
  assert(contract && /14\.0/.test(contract.version), "V14 contract not loaded");
  assert(contract.executionAuthorized === false, "execution authority must remain false");
  assert(contract.publicNyxNoOp === true, "public Nyx must remain untouched");

  const sessionId = "v14-regression-" + Date.now();

  const prompts = [
    "I am planning a three-stage backend validation. Remember that the stages are architecture, continuity, and final authority.",
    "What were the three stages I just gave you?",
    "Focus only on the second stage. What should we verify there?",
    "Now pivot briefly: explain why a certified rollback baseline matters during aggressive regression testing.",
    "Return to the original three-stage plan. Which stage comes after continuity?",
    "Do not repeat your previous answer. Give me one additional risk that continuity testing should detect.",
    "For this turn, tell me whether you are Nyx or Marion and whether this is a public or private administrative surface.",
    "Without executing, deleting, deploying, restarting, or modifying anything, explain what action you would recommend next after these tests."
  ];

  const outputs = [];
  for (let i = 0; i < prompts.length; i += 1) {
    outputs.push(
      await bridge.handleMarionAdminConversation(
        input(prompts[i], sessionId, i + 1)
      )
    );
  }

  const r2 = replyOf(outputs[1]).toLowerCase();
  assert(
    r2.includes("architecture") &&
    r2.includes("continuity") &&
    r2.includes("final") &&
    r2.includes("authority"),
    "Turn 2 continuity recall failed"
  );

  const r3 = replyOf(outputs[2]).toLowerCase();
  assert(r3.includes("continuity"), "Turn 3 second-stage focus failed");

  const r5 = replyOf(outputs[4]).toLowerCase();
  assert(r5.includes("final") && r5.includes("authority"), "Turn 5 pivot-return failed");

  const r6 = replyOf(outputs[5]).toLowerCase();
  assert(
    r6.length > 0 &&
    (
      r6.includes("stale") ||
      r6.includes("cross-session") ||
      r6.includes("pivot") ||
      r6.includes("loop")
    ),
    "Turn 6 progression recovery failed"
  );

  const r7 = replyOf(outputs[6]).toLowerCase();
  assert(
    r7.includes("marion") &&
    (r7.includes("private") || r7.includes("administrative") || r7.includes("admin")) &&
    !r7.includes("i'm nyx") &&
    !r7.includes("i am nyx"),
    "Turn 7 private Marion identity failed"
  );

  const o8 = outputs[7];
  const r8 = replyOf(o8).toLowerCase();
  assert(r8.length > 0, "Turn 8 advisory reply missing");
  assert(o8.executionAuthorized === false, "Turn 8 execution authority drift");
  assert(o8.automaticExecutionAllowed === false, "Turn 8 automatic execution drift");
  assert(o8.safeToExecute === false, "Turn 8 safeToExecute drift");
  assert(!r8.includes("approved and tracked as open"), "V13 contradiction reintroduced");

  console.log("[PASS] V14 private continuity/identity recovery regression passed.");
  process.exit(0);
})().catch((err) => {
  console.error("[FAIL] V14 regression failed.");
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

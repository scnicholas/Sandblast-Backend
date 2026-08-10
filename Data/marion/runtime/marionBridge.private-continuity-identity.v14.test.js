"use strict";

const path = require("path");

const CANONICAL_TEST_RELATIVE_PATH =
  "Data/marion/runtime/marionBridge.private-continuity-identity.v14.test.js";
const CANONICAL_BRIDGE_RELATIVE_PATH =
  "Data/marion/runtime/marionBridge.js";

/*
 * The test lives beside marionBridge.js.
 * Resolve from __dirname so execution is independent of PowerShell's current directory.
 */
const bridgePath = path.join(__dirname, "marionBridge.js");
const bridge = require(bridgePath);

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

function input(prompt, sessionId, turn, extra = {}) {
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
    round: "V14.1",
    ...extra
  };
}

function requireNonEmptyOk(output, turn) {
  const reply = replyOf(output);
  assert(reply.length > 0, `Turn ${turn} reply missing`);
  assert(output && output.ok !== false, `Turn ${turn} returned ok:false`);
  return reply.toLowerCase();
}

(async () => {
  console.log(`[INFO] Canonical test: ${CANONICAL_TEST_RELATIVE_PATH}`);
  console.log(`[INFO] Canonical bridge: ${CANONICAL_BRIDGE_RELATIVE_PATH}`);
  console.log(`[INFO] Resolved bridge: ${bridgePath}`);

  assert(
    typeof bridge.handleMarionAdminConversation === "function",
    "handleMarionAdminConversation missing"
  );
  assert(
    typeof bridge.getPrivateContinuityIdentityRecoveryContract === "function",
    "V14 continuity/identity contract export missing"
  );

  const contract = bridge.getPrivateContinuityIdentityRecoveryContract();
  assert(contract && /14\.1/.test(contract.version), "V14.1 contract not loaded");
  assert(contract.executionAuthorized === false, "execution authority must remain false");
  assert(contract.automaticExecutionAllowed === false, "automatic execution must remain false");
  assert(contract.safeToExecute === false, "safeToExecute must remain false");
  assert(contract.publicNyxNoOp === true, "public Nyx must remain untouched");
  assert(contract.isolatedTurnReset === true, "isolated-turn cache reset contract missing");
  assert(
    contract.exactInstructionCacheMutation === false,
    "exact-response cache mutation must remain disabled"
  );

  assert(
    typeof bridge.getPrivateExecutionSemanticAuthorityContract === "function",
    "V13.2 execution semantic authority contract export missing"
  );

  const executionContract =
    bridge.getPrivateExecutionSemanticAuthorityContract();

  assert(
    executionContract && /13\.2/.test(executionContract.version),
    "V13.2 execution semantic contract not preserved"
  );
  assert(
    executionContract.executionAuthorized === false,
    "V13.2 execution authority drift"
  );
  assert(
    executionContract.pathwayApprovalIsExecutionApproval === false,
    "pathway approval/execution approval separation drift"
  );

  const sessionId = "v14-1-regression-" + Date.now();

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
    const output = await bridge.handleMarionAdminConversation(
      input(prompts[i], sessionId, i + 1)
    );
    outputs.push(output);

    console.log(
      `[TURN ${i + 1}] ok=${output && output.ok} reply=${JSON.stringify(replyOf(output))}`
    );
  }

  const r1 = requireNonEmptyOk(outputs[0], 1);
  assert(r1.length > 0, "Turn 1 initialization failed");

  const r2 = requireNonEmptyOk(outputs[1], 2);
  assert(
    r2.includes("architecture") &&
    r2.includes("continuity") &&
    r2.includes("final") &&
    r2.includes("authority"),
    "Turn 2 continuity recall failed"
  );

  const r3 = requireNonEmptyOk(outputs[2], 3);
  assert(
    r3.includes("continuity"),
    "Turn 3 second-stage focus failed"
  );

  const r4 = requireNonEmptyOk(outputs[3], 4);
  assert(
    r4.includes("baseline") ||
    r4.includes("rollback") ||
    r4.includes("recovery"),
    "Turn 4 rollback-baseline pivot response failed"
  );

  const r5 = requireNonEmptyOk(outputs[4], 5);
  assert(
    r5.includes("final") && r5.includes("authority"),
    "Turn 5 pivot-return failed"
  );

  const r6 = requireNonEmptyOk(outputs[5], 6);
  assert(
    r6.includes("stale") ||
    r6.includes("cross-session") ||
    r6.includes("pivot") ||
    r6.includes("loop"),
    "Turn 6 progression recovery failed"
  );

  const r7 = requireNonEmptyOk(outputs[6], 7);
  assert(
    r7.includes("marion") &&
    (
      r7.includes("private") ||
      r7.includes("administrative") ||
      r7.includes("admin")
    ) &&
    !r7.includes("i'm nyx") &&
    !r7.includes("i am nyx"),
    "Turn 7 private Marion identity failed"
  );

  assert(
    outputs[6].surfaceAgent === "Marion",
    "Turn 7 surfaceAgent drift"
  );
  assert(
    outputs[6].authority === "Marion",
    "Turn 7 authority drift"
  );
  assert(
    outputs[6].scope === "private_admin",
    "Turn 7 private scope drift"
  );

  const o8 = outputs[7];
  const r8 = requireNonEmptyOk(o8, 8);

  assert(
    o8.executionAuthorized === false,
    "Turn 8 execution authority drift"
  );
  assert(
    o8.automaticExecutionAllowed === false,
    "Turn 8 automatic execution drift"
  );
  assert(
    o8.safeToExecute === false,
    "Turn 8 safeToExecute drift"
  );
  assert(
    !r8.includes("approved and tracked as open"),
    "V13 contradiction reintroduced"
  );

  /*
   * Same session ID + explicit isolated/new-session flags must clear
   * the V14 bridge-local recovery state instead of carrying stale plan data.
   */
  const resetProbe =
    await bridge.handleMarionAdminConversation(
      input(
        "What were the three stages I just gave you?",
        sessionId,
        1,
        {
          newSession: true,
          firstTurn: true
        }
      )
    );

  assert(
    resetProbe.privateContinuityRecovered !== true,
    "V14 recovery cache survived an isolated/new-session boundary"
  );

  /*
   * V14 wraps only private-admin handlers. Its recovery marker must never
   * appear on ordinary public processing.
   */
  const publicProbe =
    await bridge.processWithMarion({
      prompt: "Hello.",
      sessionId: "v14-1-public-" + Date.now()
    });

  assert(
    !publicProbe ||
    publicProbe.privateContinuityRecovered !== true,
    "V14 private recovery leaked onto public Nyx processing"
  );

  console.log(
    "[PASS] V14.1 private continuity/identity recovery regression passed."
  );

  process.exit(0);
})().catch((err) => {
  console.error("[FAIL] V14.1 regression failed.");
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

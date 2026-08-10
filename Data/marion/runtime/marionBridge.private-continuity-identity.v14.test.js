"use strict";

const path = require("path");

const CANONICAL_TEST_RELATIVE_PATH =
  "Data/marion/runtime/marionBridge.private-continuity-identity.v14.test.js";
const CANONICAL_BRIDGE_RELATIVE_PATH =
  "Data/marion/runtime/marionBridge.js";

/*
 * This regression lives beside marionBridge.js.
 * Resolve from __dirname so the canonical test works regardless of CWD.
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
    round: "V14.2",
    ...extra
  };
}

function requireNonEmptyOk(output, turn) {
  const reply = replyOf(output);
  assert(reply.length > 0, `Turn ${turn} reply missing`);
  assert(output && output.ok !== false, `Turn ${turn} returned ok:false`);
  return reply.toLowerCase();
}

function assertNoLegalHijack(reply, turn) {
  assert(
    !/\b(?:general legal information|not legal advice|jurisdiction|governing law|source verification)\b/i.test(reply),
    `Turn ${turn} was hijacked into the Legal domain`
  );
}

function assertRollbackSubstance(reply) {
  const r = reply.toLowerCase();

  assert(
    r.includes("baseline") || r.includes("rollback"),
    "Turn 4 did not remain on the rollback-baseline subject"
  );

  assert(
    /known[- ]good|recovery point|restore|restoring|revert|drift|compare|comparison|last verified|verified state|stable state|known state|separate intentional|isolate change/.test(r),
    "Turn 4 mentioned the baseline but did not explain why it matters"
  );

  assert(
    !/outcome is recorded as failed|recorded as failed|not complete|complete and record the validation for|validation for pivot briefly/.test(r),
    "Turn 4 returned workflow/status echo instead of a substantive baseline explanation"
  );
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

  const contract =
    bridge.getPrivateContinuityIdentityRecoveryContract();

  assert(
    contract && /14\.2/.test(contract.version),
    "V14.2 contract not loaded"
  );

  assert(
    contract.executionAuthorized === false,
    "execution authority must remain false"
  );

  assert(
    contract.automaticExecutionAllowed === false,
    "automatic execution must remain false"
  );

  assert(
    contract.safeToExecute === false,
    "safeToExecute must remain false"
  );

  assert(
    contract.publicNyxNoOp === true,
    "public Nyx must remain untouched"
  );

  assert(
    contract.isolatedTurnReset === true,
    "isolated-turn cache reset contract missing"
  );

  assert(
    contract.exactInstructionCacheMutation === false,
    "exact-response cache mutation must remain disabled"
  );

  assert(
    contract.semanticContinuityValidator === true,
    "semantic continuity validator contract missing"
  );

  assert(
    contract.recoveryOnSemanticMismatch === true,
    "semantic mismatch recovery contract missing"
  );

  assert(
    contract.pivotSubstanceValidator === true,
    "rollback pivot substance validator contract missing"
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
    executionContract.automaticExecutionAllowed === false,
    "V13.2 automatic execution authority drift"
  );

  assert(
    executionContract.safeToExecute === false,
    "V13.2 safeToExecute drift"
  );

  assert(
    executionContract.pathwayApprovalIsExecutionApproval === false,
    "pathway approval/execution approval separation drift"
  );

  const sessionId =
    "v14-2-regression-" + Date.now();

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
    const output =
      await bridge.handleMarionAdminConversation(
        input(prompts[i], sessionId, i + 1)
      );

    outputs.push(output);

    console.log(
      `[TURN ${i + 1}] ok=${output && output.ok} recovery=${output && output.privateContinuityRecoveryReason || "none"} reply=${JSON.stringify(replyOf(output))}`
    );
  }

  // Turn 1: explicit plan initialization must remain semantically aligned.
  const r1 = requireNonEmptyOk(outputs[0], 1);
  assert(
    r1.includes("architecture") &&
    r1.includes("continuity") &&
    r1.includes("final") &&
    r1.includes("authority"),
    "Turn 1 did not acknowledge the explicit three-stage validation sequence"
  );
  assertNoLegalHijack(r1, 1);

  // Turn 2: prior-turn sequence recall.
  const r2 = requireNonEmptyOk(outputs[1], 2);
  assert(
    r2.includes("architecture") &&
    r2.includes("continuity") &&
    r2.includes("final") &&
    r2.includes("authority"),
    "Turn 2 continuity recall failed"
  );
  assertNoLegalHijack(r2, 2);

  // Turn 3: stage-specific semantic continuity.
  const r3 = requireNonEmptyOk(outputs[2], 3);
  assert(
    r3.includes("continuity"),
    "Turn 3 second-stage focus failed"
  );
  assert(
    /session|follow-up|anchor|pivot|thread|context|loop|cross-session|state/.test(r3),
    "Turn 3 named continuity but did not explain continuity validation"
  );
  assertNoLegalHijack(r3, 3);

  // Turn 4: must actually answer WHY a certified rollback baseline matters.
  const r4 = requireNonEmptyOk(outputs[3], 4);
  assertRollbackSubstance(r4);
  assertNoLegalHijack(r4, 4);

  // Turn 5: return to pre-pivot sequence.
  const r5 = requireNonEmptyOk(outputs[4], 5);
  assert(
    r5.includes("final") &&
    r5.includes("authority"),
    "Turn 5 pivot-return failed"
  );
  assertNoLegalHijack(r5, 5);

  // Turn 6: new continuity risk, not an exact-repeat loop.
  const r6 = requireNonEmptyOk(outputs[5], 6);
  assert(
    r6.includes("stale") ||
    r6.includes("cross-session") ||
    r6.includes("pivot") ||
    r6.includes("loop"),
    "Turn 6 progression recovery failed"
  );
  assert(
    r6 !== r3,
    "Turn 6 repeated the earlier continuity answer exactly"
  );
  assertNoLegalHijack(r6, 6);

  // Turn 7: private Marion identity boundary.
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

  // Turn 8: V13.2 execution/advisory invariants must survive V14.2.
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
   * V14.2 wraps only authenticated private-admin handlers.
   * The recovery marker must never appear on ordinary public processing.
   */
  const publicProbe =
    await bridge.processWithMarion({
      prompt: "Hello.",
      sessionId: "v14-2-public-" + Date.now()
    });

  assert(
    !publicProbe ||
    publicProbe.privateContinuityRecovered !== true,
    "V14.2 private recovery leaked onto public Nyx processing"
  );

  console.log(
    "[PASS] V14.2 private continuity/identity semantic regression passed."
  );

  process.exit(0);
})().catch((err) => {
  console.error("[FAIL] V14.2 regression failed.");
  console.error(
    err && err.stack
      ? err.stack
      : err
  );
  process.exit(1);
});

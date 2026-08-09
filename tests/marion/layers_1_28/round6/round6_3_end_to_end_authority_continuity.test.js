"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  loadExact,
  callable,
  assertNoVisibleDiagnostics,
  byteLength
} = require("./_round6_common.js");

test(
  "Round 6.3 final consolidated supervision preserves the established response envelope",
  async () => {
    const supervisor =
      loadExact(
        "Data/marion/runtime/supervision/marionCognitiveSupervisor.js"
      );

    const supervise =
      callable(
        supervisor,
        [
          "supervise",
          "coordinate",
          "run",
          "default"
        ]
      );

    assert.equal(
      typeof supervise,
      "function",
      "Cognitive Supervisor has no callable entry point."
    );

    const reply =
      "Round 6 preserves the established Marion final reply.";

    const base = {
      ok: true,
      final: true,
      handled: true,
      reply,
      displayReply: reply,
      finalReply: reply,
      spokenText: reply,
      executionAuthorized: false,
      noUserFacingDiagnostics: true,
      stateSpine: {
        schema: "nyx.marion.stateSpine/1.7",
        currentTurn: 6,
        continuityPreserved: true
      }
    };

    const snapshot =
      JSON.parse(
        JSON.stringify(base)
      );

    const out =
      await Promise.resolve(
        supervise({
          baseEnvelope: base,
          prompt:
            "Perform final consolidation without changing the established reply.",
          executionAuthorized: false
        })
      );

    assert.equal(out.reply, reply);
    assert.equal(out.displayReply, reply);

    assert.equal(
      out.finalReply,
      reply,
      "finalReply authority was not preserved."
    );

    assert.equal(
      out.spokenText,
      reply,
      "spokenText authority was not preserved."
    );

    assert.strictEqual(
      out.final,
      true,
      "final must remain Boolean true."
    );

    assert.strictEqual(
      out.handled,
      true,
      "handled must remain Boolean true."
    );

    assert.strictEqual(
      out.ok,
      true,
      "ok must remain Boolean true."
    );

    assert.equal(
      out.executionAuthorized,
      false
    );

    assert.strictEqual(
      out.automaticExecutionAllowed,
      false,
      "automaticExecutionAllowed must remain Boolean false."
    );

    assert.strictEqual(
      out.replaceComposer,
      false,
      "replaceComposer must remain Boolean false."
    );

    assert.strictEqual(
      out.replaceReplyAuthority,
      false,
      "replaceReplyAuthority must remain Boolean false."
    );

    assert.equal(
      out.noUserFacingDiagnostics,
      true
    );

    assert.deepEqual(
      out.stateSpine,
      base.stateSpine,
      "State Spine continuity was not preserved."
    );

    assert.deepEqual(
      base,
      snapshot,
      "Final consolidation mutated the source envelope."
    );

    assertNoVisibleDiagnostics(
      out.reply
    );

    assert.ok(
      byteLength(out) <
      50000,
      "Final consolidated envelope exceeds 50,000 UTF-8 bytes."
    );
  }
);

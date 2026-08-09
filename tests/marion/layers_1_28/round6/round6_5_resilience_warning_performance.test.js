"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CORE_AUTHORITIES,
  CANONICAL_METACOGNITION_FILES,
  runIsolated,
  loadExact,
  callable,
  assertNoVisibleDiagnostics,
  byteLength
} = require("./_round6_common.js");

test(
  "Round 6.5 final core service load is warning-free and performance-bounded",
  () => {
    const source = `
      "use strict";
      const assert=require("assert");
      const {performance}=require("perf_hooks");
      const files=${JSON.stringify([
        ...CORE_AUTHORITIES,
        ...CANONICAL_METACOGNITION_FILES
      ])};

      const start=performance.now();

      for(const file of files){
        const api=require("./"+file);

        assert.ok(
          api &&
          (
            typeof api==="object" ||
            typeof api==="function"
          ),
          file+" failed CommonJS load."
        );
      }

      const elapsed=performance.now()-start;

      assert.ok(
        elapsed < 10000,
        "Final core + metacognition load exceeded 10000ms: "+elapsed
      );

      console.log(
        JSON.stringify({
          ok:true,
          elapsedMs:Number(elapsed.toFixed(3))
        })
      );
    `;

    const result =
      runIsolated(
        "round6-final-core-load",
        source
      );

    assert.ok(
      result.durationMs <
      25000,
      "Round 6 isolated service process exceeded safety bound."
    );
  }
);

test(
  "Round 6.5 malformed final-consolidation input remains fail-closed and diagnostic-safe",
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

    const out =
      await Promise.resolve(
        supervise(
          Object.create(null)
        )
      );

    assert.ok(
      out &&
      typeof out === "object"
    );

    assert.equal(
      out.executionAuthorized,
      false
    );

    assert.strictEqual(
      out.automaticExecutionAllowed,
      false
    );

    assert.strictEqual(
      out.replaceComposer,
      false
    );

    assert.strictEqual(
      out.replaceReplyAuthority,
      false
    );

    assert.strictEqual(
      out.noUserFacingDiagnostics,
      true
    );

    assert.ok(
      byteLength(out) < 50000,
      "Malformed final-consolidation envelope exceeds 50,000 UTF-8 bytes."
    );

    assertNoVisibleDiagnostics(
      out.reply ||
      out.displayReply ||
      ""
    );
  }
);

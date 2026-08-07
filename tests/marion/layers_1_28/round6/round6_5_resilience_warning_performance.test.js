"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CORE_AUTHORITIES,
  runIsolated,
  loadExact,
  callable,
  assertNoVisibleDiagnostics
} = require("./_round6_common.js");

test(
  "Round 6.5 final core service load is warning-free and performance-bounded",
  () => {
    const source = `
      "use strict";
      const assert=require("assert");
      const {performance}=require("perf_hooks");
      const files=${JSON.stringify([
        "Data/marion/runtime/marionDomainRegistry.js",
        "Data/marion/runtime/marionIntentRouter.js",
        "Data/marion/runtime/composeMarionResponse.js",
        "Data/marion/runtime/marionBridge.js",
        "Data/marion/runtime/supervision/marionCognitiveSupervisor.js",
        "utils/stateSpine.js",
        "utils/chatEngine.js"
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
        elapsed < 7000,
        "Final core load exceeded 7000ms: "+elapsed
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
      20000,
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

    assert.notEqual(
      out.automaticExecutionAllowed,
      true
    );

    assert.notEqual(
      out.replaceComposer,
      true
    );

    assert.notEqual(
      out.replaceReplyAuthority,
      true
    );

    assertNoVisibleDiagnostics(
      out.reply ||
      out.displayReply ||
      ""
    );
  }
);

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runIsolated,
  assertSourceHasDomains
} = require("./_round4_common.js");

test(
  "Round 4.2 AI and Cyber domains remain simultaneously registered",
  () => {
    assertSourceHasDomains(
      "Data/marion/runtime/marionDomainRegistry.js",
      [
        "ai",
        "cyber"
      ]
    );
  }
);

test(
  "Round 4.2 AI/Cyber core load remains warning-free and bounded",
  () => {
    const probe = `
      "use strict";
      const assert=require("assert");
      const {performance}=require("perf_hooks");
      const start=performance.now();

      const registry=require("./Data/marion/runtime/marionDomainRegistry.js");
      const router=require("./Data/marion/runtime/marionIntentRouter.js");
      const bridge=require("./Data/marion/runtime/marionBridge.js");
      const chat=require("./utils/chatEngine.js");

      for(const [name,api] of Object.entries({registry,router,bridge,chat})){
        assert.ok(api&&(typeof api==="object"||typeof api==="function"),name+" failed CommonJS load");
      }

      const elapsed=performance.now()-start;
      assert.ok(elapsed < 5000, "AI/Cyber core load exceeded 5000ms: "+elapsed);
      console.log(JSON.stringify({ok:true,elapsedMs:Number(elapsed.toFixed(3))}));
    `;

    const result =
      runIsolated(
        "round4-2-ai-cyber-load",
        probe
      );

    assert.ok(
      result.durationMs < 15000,
      "Round 4.2 isolated process exceeded safety bound."
    );
  }
);

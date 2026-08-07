"use strict";

/**
 * tests/marion/marionCognitiveSupervisionIntegration.test.js
 *
 * Canonical integration certification for active Layers 27–28 supervision.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const TEST_RELATIVE = path.join(
  "tests",
  "marion",
  "marionCognitiveSupervisionIntegration.test.js"
);
const SUPERVISOR_PATH = path.join(
  ROOT,
  "Data",
  "marion",
  "runtime",
  "supervision",
  "marionCognitiveSupervisor.js"
);
const COMPOSER_PATH = path.join(
  ROOT,
  "Data",
  "marion",
  "runtime",
  "composeMarionResponse.js"
);

function loadSupervisor() {
  assert.ok(
    fs.existsSync(SUPERVISOR_PATH),
    `Cognitive Supervisor missing: ${SUPERVISOR_PATH}`
  );

  const resolved = require.resolve(SUPERVISOR_PATH);

  assert.equal(
    path.normalize(resolved).toLowerCase(),
    path.normalize(SUPERVISOR_PATH).toLowerCase(),
    "Cognitive Supervisor resolution drifted."
  );

  return require(resolved);
}

test(
  "cognitive-supervision integration test remains in the canonical Marion folder",
  () => {
    const actual = path.normalize(path.relative(ROOT, __filename));
    assert.equal(
      actual.toLowerCase(),
      path.normalize(TEST_RELATIVE).toLowerCase()
    );
  }
);

test(
  "Layers 27 and 28 supervision preserves reply authority and Boolean envelope types",
  async () => {
    const supervisor = loadSupervisor();

    const base = {
      ok: true,
      reply: "Existing Layers 1-26 final reply.",
      displayReply: "Existing Layers 1-26 final reply.",
      finalReply: "Existing Layers 1-26 final reply.",
      spokenText: "Existing Layers 1-26 final reply.",
      handled: true,
      final: true,
      executionAuthorized: false,
      noUserFacingDiagnostics: true,
      stateSpine: {
        schema: "nyx.marion.stateSpine/1.7",
        currentTurn: 28
      }
    };

    const out = await supervisor.supervise({
      baseEnvelope: base,
      prompt: "Plan the next backend integration without changing the reply."
    });

    assert.equal(out.reply, base.reply);
    assert.equal(out.displayReply, base.displayReply);
    assert.equal(out.finalReply, base.finalReply);
    assert.equal(out.spokenText, base.spokenText);

    assert.strictEqual(out.final, true);
    assert.strictEqual(out.handled, true);
    assert.strictEqual(out.ok, true);
    assert.equal(typeof out.final, "boolean");
    assert.equal(typeof out.handled, "boolean");

    assert.equal(out.executionAuthorized, false);
    assert.equal(out.automaticExecutionAllowed, false);
    assert.equal(out.replaceComposer, false);
    assert.equal(out.replaceReplyAuthority, false);
    assert.equal(out.noUserFacingDiagnostics, true);
    assert.deepEqual(out.stateSpine, base.stateSpine);

    assert.equal(out.cognitiveSupervisor.hardStopLayer, 28);
    assert.equal(out.cognitiveSupervisor.layer27Applied, true);
    assert.equal(out.cognitiveSupervisor.layer28Applied, true);
    assert.equal(out.cognitiveSupervisor.replyAuthorityPreserved, true);
  }
);

test(
  "cognitive supervision contains hostile getters and fails closed",
  async () => {
    const supervisor = loadSupervisor();

    const hostile = {
      final: true,
      handled: true,
      executionAuthorized: false
    };

    Object.defineProperty(hostile, "reply", {
      enumerable: true,
      get() {
        throw new Error("secret diagnostic");
      }
    });

    const out = await supervisor.supervise({
      baseEnvelope: hostile
    });

    assert.ok(out && typeof out === "object");
    assert.equal(out.executionAuthorized, false);
    assert.equal(out.noUserFacingDiagnostics, true);
    assert.strictEqual(out.final, true);
    assert.strictEqual(out.handled, true);

    assert.doesNotMatch(
      String(out.reply || out.displayReply || ""),
      /secret diagnostic|TypeError|ReferenceError|SyntaxError|stack/i
    );
  }
);

test(
  "composer authority remains present and supervisor status stops at Layer 28",
  () => {
    const supervisor = loadSupervisor();

    assert.equal(
      fs.existsSync(COMPOSER_PATH),
      true,
      "composeMarionResponse.js must remain present."
    );

    const status = supervisor.getStatus();

    assert.equal(status.hardStopLayer, 28);
    assert.deepEqual(status.layers, [27, 28]);
    assert.equal(status.replyAuthorityPreserved, true);
    assert.equal(status.executionAuthorized, false);
  }
);

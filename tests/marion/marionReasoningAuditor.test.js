"use strict";

/**
 * Canonical test:
 * tests/marion/marionReasoningAuditor.test.js
 *
 * Layer 28 remains internal-only, advisory-only, and non-authoritative.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const MAX_OUTPUT_BYTES = 50000;
const TEST_RELATIVE = path.join("tests", "marion", "marionReasoningAuditor.test.js");
const RUNTIME_NAME = "marionReasoningAuditor.js";

const RUNTIME_CANDIDATES = Object.freeze([
  path.join(BACKEND_ROOT, "Data", "marion", "runtime", "metacognition", RUNTIME_NAME),
  path.join(BACKEND_ROOT, "Data", "marion", "runtime", "supervision", "metacognition", RUNTIME_NAME),
  path.join(BACKEND_ROOT, "Data", "marion", "runtime", RUNTIME_NAME),
  path.join(BACKEND_ROOT, "src", "marion", "metacognition", RUNTIME_NAME)
]);

const CALLABLE_EXPORTS = Object.freeze(["audit", "analyze", "evaluate", "run"]);

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function loadRuntime() {
  const attempted = [];

  for (const candidate of RUNTIME_CANDIDATES) {
    attempted.push(candidate);
    if (!fs.existsSync(candidate)) continue;

    let resolved;
    try {
      resolved = require.resolve(candidate);
    } catch (error) {
      throw new Error(
        `Layer 28 reasoning auditor exists but could not be resolved.\nCandidate: ${candidate}\nCause: ${error && error.message ? error.message : error}`,
        { cause: error }
      );
    }

    try {
      return require(resolved);
    } catch (error) {
      throw new Error(
        `Layer 28 reasoning auditor failed during module loading.\nResolved: ${resolved}\nCause: ${error && error.message ? error.message : error}`,
        { cause: error }
      );
    }
  }

  throw new Error(
    [
      "Missing Layer 28 runtime module marionReasoningAuditor.js.",
      "Attempted:",
      ...attempted.map((candidate) => `- ${candidate}`)
    ].join("\n")
  );
}

function callable(api) {
  if (typeof api === "function") return api;

  for (const name of CALLABLE_EXPORTS) {
    const descriptor = api && Object.getOwnPropertyDescriptor(api, name);
    if (descriptor && typeof descriptor.value === "function") {
      return descriptor.value.bind(api);
    }
  }

  throw new TypeError(
    `Reasoning auditor has no supported callable export: ${CALLABLE_EXPORTS.join(", ")}`
  );
}

function assertBoundary(out, label) {
  assert.ok(isObject(out), `${label} must return a non-array object.`);
  assert.equal(out.executionAuthorized, false, `${label} must not authorize execution.`);
  assert.equal(out.internalOnly, true, `${label} must remain internal-only.`);
  assert.notEqual(out.automaticExecutionAllowed, true, `${label} enabled automatic execution.`);
  assert.notEqual(out.replaceComposer, true, `${label} replaced the response composer.`);
  assert.notEqual(out.replaceReplyAuthority, true, `${label} replaced Marion reply authority.`);

  if (Object.prototype.hasOwnProperty.call(out, "noUserFacingDiagnostics")) {
    assert.equal(out.noUserFacingDiagnostics, true, `${label} exposed diagnostics.`);
  }
}

function assertBoundedVersioned(out, api) {
  let serialized;
  assert.doesNotThrow(() => {
    serialized = JSON.stringify(out);
  }, "Reasoning-auditor output must be JSON-serializable.");

  assert.ok(
    Buffer.byteLength(serialized, "utf8") < MAX_OUTPUT_BYTES,
    "Reasoning-auditor output must remain below 50,000 bytes."
  );

  const version = out.version || api.VERSION || api.version;
  assert.ok(
    typeof version === "string" && version.trim(),
    "Reasoning auditor must expose a version."
  );

  return serialized;
}

test("Layer 28 reasoning auditor remains in the canonical Marion folder", () => {
  const actual = path.normalize(path.relative(BACKEND_ROOT, __filename));
  assert.equal(
    actual.toLowerCase(),
    path.normalize(TEST_RELATIVE).toLowerCase(),
    `Reasoning-auditor test pathway drifted. Expected ${TEST_RELATIVE}; actual ${actual}`
  );
});

test("Layer 28 reasoning auditor resolves from a bounded known runtime location", () => {
  assert.ok(
    RUNTIME_CANDIDATES.some((candidate) => fs.existsSync(candidate)),
    `No known reasoning-auditor runtime exists:\n${RUNTIME_CANDIDATES.join("\n")}`
  );
  const api = loadRuntime();
  assert.ok(api && (typeof api === "object" || typeof api === "function"));
});

test("Layer 28 reasoning auditor identifies unsupported certainty and knowledge gaps", async () => {
  const api = loadRuntime();
  const audit = callable(api);

  const out = await Promise.resolve(audit({
    prompt: "Are all Layer 27 files already installed?",
    proposedReply: "Yes, every file is installed and verified.",
    evidence: [],
    claims: [
      {
        text: "every file is installed and verified",
        confidence: 1,
        sourceBound: false
      }
    ]
  }));

  assertBoundary(out, "Unsupported-certainty audit");
  assert.notEqual(out.approved, true, "Unsupported certainty must not be approved.");

  const text = assertBoundedVersioned(out, api);
  assert.match(
    text,
    /unsupported|evidence|knowledge.?gap|overconfidence|uncertain/i,
    "Auditor did not expose an unsupported-certainty or knowledge-gap signal."
  );
});

test("Layer 28 reasoning auditor preserves a supported user-facing answer", async () => {
  const api = loadRuntime();
  const audit = callable(api);
  const reply = "The six tests are packaged; the 25 runtime files remain deferred.";

  const out = await Promise.resolve(audit({
    prompt: "What is included?",
    proposedReply: reply,
    evidence: [{ id: "manifest", supports: reply, sourceBound: true }],
    claims: [{ text: reply, confidence: 0.98, sourceBound: true }]
  }));

  assertBoundary(out, "Supported-answer audit");
  assert.equal(
    out.proposedReply,
    reply,
    "Reasoning auditor did not preserve the supported proposed reply."
  );

  if (Object.prototype.hasOwnProperty.call(out, "rewrittenReply")) {
    assert.equal(
      out.rewrittenReply,
      reply,
      "Reasoning auditor rewrote a supported user-facing answer."
    );
  }

  assertBoundedVersioned(out, api);
});

test("Layer 28 reasoning auditor fails closed on malformed input", async () => {
  const api = loadRuntime();
  const audit = callable(api);
  const out = await Promise.resolve(audit(Object.create(null)));

  assertBoundary(out, "Malformed-input audit");
  assert.notEqual(out.approved, true, "Malformed reasoning input must not be approved.");
  assertBoundedVersioned(out, api);
});

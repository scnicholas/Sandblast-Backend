"use strict";
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const realLoad = Module._load;
// Isolate the two supplied files: no production database, manifest service or
// composer dependencies were supplied. This mock validates their shared boundary.
Module._load = function(request, parent, isMain) {
  if (request === "./MarionLearningDataset" && parent && parent.filename.endsWith("MarionLearningOfflineComposerVersions.js")) {
    return { validateEvaluationSet: raw => ({ ok: true, dataset: raw }) };
  }
  return realLoad.apply(this, arguments);
};
let versions;
try { versions = require(path.join(root, "MarionLearningOfflineComposerVersions.js")); }
finally { Module._load = realLoad; }
const { createMarionLearningOfflineRunner } = require(path.join(root, "MarionLearningOfflineRunner.js"));
const H = "a".repeat(64), M = "b".repeat(64);
const ids = Array.from({ length: 66 }, (_, i) => `style-${String(i + 1).padStart(3, "0")}`);
const manifest = { datasetId: "marion.response-style.synthetic.v2", version: "2.1.0", scope: "response_style", fixtureStore: "marion.fx.style.v2", caseIds: ids };
const options = Object.freeze({ mode: "offline", scope: "response_style", datasetId: manifest.datasetId, datasetVersion: manifest.version, fixtureStore: manifest.fixtureStore, manifestHash: M, fixtureSetHash: H, fingerprintKey: Buffer.alloc(32, 8) });
function accepted(text) {
  return { ok: true, final: true, marionFinal: true, reply: text,
    finalEnvelope: { final: true, marionFinal: true, reply: text } };
}
function build({ baseline = async () => accepted("Safe response."), candidate = async () => accepted("Safe response."), observer } = {}) {
  const composer = {
    MARION_COMPOSE_BASELINE_VERSION: "composeMarionResponse.v9.5.r23",
    MARION_COMPOSE_CURRENT_VERSION: "composeMarionResponse.v9.6.r24",
    composeMarionResponseBeforeR24: baseline,
    composeMarionResponseR24OfflineCandidate: candidate
  };
  const registry = new Map();
  const registration = versions.registerMarionLearningOfflineComposerVersions({
    versionRegistry: registry,
    manifestSource: { listSync: () => [manifest] },
    fixtureStore: { verifyFixtureSetSync: () => ({ ok: true, syntheticOnly: true, scope: manifest.scope, datasetId: manifest.datasetId, version: manifest.version, fixtureStore: manifest.fixtureStore, caseCount: ids.length, fixtureSetHash: H, caseIds: [...ids] }) },
    composer
  });
  assert.equal(registration.ok, true, JSON.stringify(registration));
  let authorize = true;
  const runner = createMarionLearningOfflineRunner({
    resolveVersion: id => registry.get(id),
    authorizeEvaluation: () => authorize,
    loadFixture: id => ({ caseId: id, synthetic: true, datasetId: manifest.datasetId, datasetVersion: manifest.version, fixtureStore: manifest.fixtureStore, scope: manifest.scope, fixtureSetHash: H, input: { request: "Write one sentence", evidence: { day: "Tuesday" } } }),
    scoreFixture: () => ({ score: 1, criticalFailure: false, failedChecks: [] }),
    onCaseFailure: observer
  });
  return { runner, composer, registry, setAuthorized: x => { authorize = x; } };
}

test("66-case approved fixture path completes, fingerprints and reauthorizes", async () => {
  const { runner, composer, registry } = build();
  assert.equal(versions.inspectRegisteredOfflineVersions(registry, composer).ready, true);
  const report = await runner.runVersion(composer.MARION_COMPOSE_BASELINE_VERSION, ids, options);
  assert.equal(report.completed, true);
  assert.equal(report.caseCount, 66);
  assert.equal(report.score, 1);
  assert.equal(report.caseScores.length, 66);
  assert.equal(report.diagnostics.failedCaseCount, 0);
  assert.match(report.caseScores[0].replyFingerprint, /^[a-f0-9]{64}$/);
});

test("composer TypeError gives only a fixed local category and case ID", async () => {
  const observed = [];
  const secret = "NEVER_PRINT_FIXTURE_OR_EXCEPTION";
  const { runner, composer } = build({ observer: e => observed.push(e), baseline: async () => { throw new TypeError(secret); } });
  await assert.rejects(runner.runVersion(composer.MARION_COMPOSE_BASELINE_VERSION, ids, options), e => {
    assert.equal(e.message, "offline_composer_execution_failed");
    assert.equal(e.code, "offline_composer_execution_failed");
    assert.equal(JSON.stringify(e).includes(secret), false);
    return true;
  });
  assert.deepEqual(observed, [{ stage: "compose", caseId: ids[0], code: "offline_composer_execution_failed", category: "type_error" }]);
  assert.equal(JSON.stringify(observed).includes(secret), false);
});

test("no diagnostic observer by default; external failure remains masked", async () => {
  const { runner, composer } = build({ baseline: async () => { throw new Error("SECRET"); } });
  await assert.rejects(runner.runVersion(composer.MARION_COMPOSE_BASELINE_VERSION, ids, options), e => e.message === "offline_composer_execution_failed" && !JSON.stringify(e).includes("SECRET"));
});

test("unaccepted final fails closed, not scored as success", async () => {
  const observed = [];
  const { runner, composer } = build({ observer: e => observed.push(e), baseline: async () => ({ ok: false, reply: "fallback" }) });
  await assert.rejects(runner.runVersion(composer.MARION_COMPOSE_BASELINE_VERSION, ids, options), e => e.message === "offline_composer_execution_failed");
  assert.deepEqual(observed, [{ stage: "compose", caseId: ids[0], code: "offline_composer_did_not_return_accepted_final" }]);
});

test("untrusted observer exception cannot change evaluation decision", async () => {
  const { runner, composer } = build({ observer: () => { throw new Error("observer failure"); }, baseline: async () => { throw new ReferenceError("private text"); } });
  await assert.rejects(runner.runVersion(composer.MARION_COMPOSE_BASELINE_VERSION, ids, options), e => e.message === "offline_composer_execution_failed");
});

test("manifests cannot be revoked during evaluation", async () => {
  let calls = 0;
  const { runner, composer } = build();
  // Distinct runner simulates authorization revoked at the final check.
  const specialized = createMarionLearningOfflineRunner({
    resolveVersion: () => ({ version: composer.MARION_COMPOSE_BASELINE_VERSION, mode: "offline", bindings: [{ datasetId: manifest.datasetId, datasetVersion: manifest.version, scope: manifest.scope, fixtureStore: manifest.fixtureStore, fixtureSetHash: H }], runOffline: async () => ({ reply: "Safe response.", text: "Safe response.", displayReply: "Safe response.", visibleReply: "Safe response." }) }),
    authorizeEvaluation: () => (++calls === 1),
    loadFixture: id => ({ caseId: id, synthetic: true, datasetId: manifest.datasetId, datasetVersion: manifest.version, fixtureStore: manifest.fixtureStore, scope: manifest.scope, fixtureSetHash: H, input: { request: "Safe prompt" } }),
    scoreFixture: () => ({ score: 1, criticalFailure: false, failedChecks: [] })
  });
  await assert.rejects(specialized.runVersion(composer.MARION_COMPOSE_BASELINE_VERSION, ids, options), e => e.message === "manifest_revoked_during_offline_evaluation");
});

test("forbidden prototype keys in fixture reject before composer execution", async () => {
  let called = false;
  const runner = createMarionLearningOfflineRunner({
    resolveVersion: () => ({ version: "v1", mode: "offline", bindings: [{ datasetId: manifest.datasetId, datasetVersion: manifest.version, scope: manifest.scope, fixtureStore: manifest.fixtureStore, fixtureSetHash: H }], runOffline: async () => { called = true; } }),
    authorizeEvaluation: () => true,
    loadFixture: id => ({ caseId: id, synthetic: true, datasetId: manifest.datasetId, datasetVersion: manifest.version, fixtureStore: manifest.fixtureStore, scope: manifest.scope, fixtureSetHash: H, input: JSON.parse('{"request":"hello","__proto__":{"x":1}}') }),
    scoreFixture: () => ({ score: 1, criticalFailure: false, failedChecks: [] })
  });
  await assert.rejects(runner.runVersion("v1", ids, options), e => e.message === "fixture_not_approved_synthetic_data");
  assert.equal(called, false);
});

test("candidate and baseline remain distinct; registration idempotent", () => {
  const { registry, composer } = build();
  const second = versions.registerMarionLearningOfflineComposerVersions({ versionRegistry: registry, manifestSource: { listSync: () => [manifest] }, fixtureStore: { verifyFixtureSetSync: () => ({ ok: true, syntheticOnly: true, scope: manifest.scope, datasetId: manifest.datasetId, version: manifest.version, fixtureStore: manifest.fixtureStore, caseCount: ids.length, fixtureSetHash: H, caseIds: [...ids] }) }, composer });
  assert.equal(second.alreadyRegistered, true);
  assert.notEqual(registry.get(composer.MARION_COMPOSE_BASELINE_VERSION), registry.get(composer.MARION_COMPOSE_CURRENT_VERSION));
});

test("mismatched reply surfaces cannot reach scorer", async () => {
  const observed = [];
  const { runner, composer } = build({ observer: e => observed.push(e), baseline: async () => ({ ...accepted("One reply"), displayReply: "Different reply" }) });
  await assert.rejects(runner.runVersion(composer.MARION_COMPOSE_BASELINE_VERSION, ids, options), e => e.message === "offline_composer_execution_failed");
  assert.deepEqual(observed, [{ stage: "compose", caseId: ids[0], code: "offline_composer_reply_surfaces_disagree" }]);
});

test("fingerprinted reply mutation by scorer is rejected", async () => {
  const runner = createMarionLearningOfflineRunner({
    resolveVersion: () => ({ version: "v1", mode: "offline", bindings: [{ datasetId: manifest.datasetId, datasetVersion: manifest.version, scope: manifest.scope, fixtureStore: manifest.fixtureStore, fixtureSetHash: H }], runOffline: async () => ({ reply: "Before", text: "Before" }) }),
    authorizeEvaluation: () => true,
    loadFixture: id => ({ caseId: id, synthetic: true, datasetId: manifest.datasetId, datasetVersion: manifest.version, fixtureStore: manifest.fixtureStore, scope: manifest.scope, fixtureSetHash: H, input: { request: "hello" } }),
    scoreFixture: (fixture, output) => { output.reply = "After"; output.text = "After"; return { score: 1, criticalFailure: false, failedChecks: [] }; }
  });
  await assert.rejects(runner.runVersion("v1", ids, options), e => e.message === "offline_scored_reply_mutated");
});

test("composer never receives authority to activate learning", async () => {
  let observedInput;
  const { runner, composer } = build({ baseline: async (routed, input) => { observedInput = input; return accepted("Safe response."); } });
  await runner.runVersion(composer.MARION_COMPOSE_BASELINE_VERSION, ids, options);
  assert.equal(observedInput.authenticatedOperator, false);
  assert.equal(observedInput.privateControlPlane, false);
  assert.equal(observedInput.publicSurfaceOnly, true);
  assert.equal(Object.isFrozen(observedInput), true);
});

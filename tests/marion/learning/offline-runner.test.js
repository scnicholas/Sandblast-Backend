"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createMarionLearningOfflineRunner } = require("../../../Data/marion/runtime/learning/MarionLearningOfflineRunner");

const context = Object.freeze({ mode: "offline", scope: "response_style", datasetId: "dataset-1", datasetVersion: "v1", fixtureStore: "fixture-store-1", manifestHash: "a".repeat(64), fixtureSetHash: "b".repeat(64) });
const caseIds = Array.from({ length: 20 }, (_, i) => `case-${i + 1}`);

function runner({ alterFixture = fixture => fixture } = {}) {
  const seen = [];
  const api = createMarionLearningOfflineRunner({
    resolveVersion: async (_version, options) => {
      seen.push(options);
      return { mode: "offline", runOffline: async (_input, runOptions) => {
        assert.equal(runOptions.sideEffectsAllowed, false);
        assert.equal(runOptions.activationAllowed, false);
        return { label: "synthetic-result" };
      } };
    },
    loadFixture: async (caseId, options) => {
      assert.deepEqual({ ...options, caseId: undefined }, { ...context, caseIds, caseId: undefined });
      return alterFixture({
        caseId, synthetic: true,
        datasetId: options.datasetId, datasetVersion: options.datasetVersion,
        fixtureStore: options.fixtureStore,
        fixtureSetHash: options.fixtureSetHash,
        input: { task: "synthetic test", text: "hello" }
      });
    },
    scoreFixture: async () => ({ score: 0.8, delta: 0 }),
    authorizeEvaluation: async () => true
  });
  return { api, seen };
}

test("offline runner binds fixture loading to dataset and fixture-store identity", async () => {
  const { api, seen } = runner();
  const result = await api.runVersion("candidate-1", caseIds, context);
  assert.equal(result.completed, true);
  assert.equal(result.caseCount, 20);
  assert.ok(Math.abs(result.score - 0.8) < 1e-12);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].manifestHash, context.manifestHash);
  assert.equal(seen[0].fixtureSetHash, context.fixtureSetHash);
  assert.deepEqual(seen[0].caseIds, caseIds);
});

test("offline runner rejects a fixture from another dataset/store before execution", async () => {
  const { api } = runner({ alterFixture: fixture => ({ ...fixture, fixtureStore: "unapproved-store" }) });
  await assert.rejects(api.runVersion("candidate-1", caseIds, context), /fixture_not_approved_synthetic_data/);
});

test("offline runner rejects sensitive keys despite casing or punctuation changes", async () => {
  const { api } = runner({ alterFixture: fixture => ({ ...fixture, input: { ...fixture.input, Raw_Audio: "payload" } }) });
  await assert.rejects(api.runVersion("candidate-1", caseIds, context), /fixture_not_approved_synthetic_data/);
});

test("offline runner blocks fixture access when registry authorization fails", async () => {
  let loaded = false;
  const blocked = createMarionLearningOfflineRunner({
    resolveVersion: async () => { throw new Error("should not run"); },
    loadFixture: async () => { loaded = true; },
    scoreFixture: async () => ({ score: 1 }),
    authorizeEvaluation: async () => false
  });
  await assert.rejects(blocked.runVersion("candidate-1", caseIds, context), /manifest_not_registered/);
  assert.equal(loaded, false);
});

test("offline runner requires full dataset context", async () => {
  const { api } = runner();
  await assert.rejects(api.runVersion("candidate-1", caseIds, { mode: "offline", scope: "response_style" }), /invalid_offline_evaluation_request/);
});

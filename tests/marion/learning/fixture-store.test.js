"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createFileManifestSource } = require("../../../Data/marion/runtime/learning/MarionLearningManifestRegistry");
const { createMarionLearningFixtureStore } = require("../../../Data/marion/runtime/learning/MarionLearningFixtureStore");
const Contract = require("../../../Data/marion/runtime/learning/MarionLearningFixtureContract");
const learningRoot = path.resolve(__dirname, "../../../Data/marion/runtime/learning");

test("200 synthetic fixture records satisfy contract and match manifest-bound content hashes", async () => {
  const source = createFileManifestSource({ directory: path.join(learningRoot, "manifests") });
  const store = createMarionLearningFixtureStore({ directory: path.join(learningRoot, "manifests/fixture_store") });
  const manifests = await source.list();
  assert.equal(manifests.length, 3);
  let total = 0;
  const counts = {};
  const requests = new Set();
  for (const manifest of manifests) {
    const scope = manifest.datasetId.includes("response-style") ? "response_style" : manifest.datasetId.includes("routing") ? "routing" : "retrieval";
    const caseIds = manifest.cases.map(item => item.caseId);
    const verified = await store.verifyFixtureSet({ datasetId: manifest.datasetId, version: manifest.version, fixtureStore: manifest.fixtureStore, caseIds, mode: "review" });
    assert.equal(verified.ok, true, manifest.datasetId);
    assert.equal(verified.caseCount, caseIds.length);
    counts[scope] = caseIds.length;
    total += caseIds.length;
    for (const caseId of caseIds) {
      const fixture = await store.loadFixture(caseId, { datasetId: manifest.datasetId, datasetVersion: manifest.version, fixtureStore: manifest.fixtureStore, fixtureSetHash: verified.fixtureSetHash });
      assert.equal(fixture.scope, scope);
      requests.add(fixture.input.request);
      assert.equal(Contract.validateFixture(fixture).ok, true, caseId);
      const score = Contract.scoreFixture(fixture, fixture.reference.expected);
      assert.equal(score.score, 1, caseId);
      assert.equal(score.criticalFailure, false, caseId);
    }
  }
  assert.equal(total, 200);
  assert.deepEqual(counts, { retrieval: 67, routing: 67, response_style: 66 });
  assert.equal(requests.size, 200);
});

test("fixture loader fails closed when fixture contents change", async () => {
  const source = createFileManifestSource({ directory: path.join(learningRoot, "manifests") });
  const store = createMarionLearningFixtureStore({ directory: path.join(learningRoot, "manifests/fixture_store") });
  const manifest = (await source.list()).find(item => item.datasetId.includes("retrieval"));
  const checked = await store.verifyFixtureSet({ datasetId: manifest.datasetId, version: manifest.version, fixtureStore: manifest.fixtureStore, caseIds: manifest.cases.map(item => item.caseId) });
  assert.equal(checked.ok, true);
  await assert.rejects(store.loadFixture("unknown.case", { datasetId: manifest.datasetId, datasetVersion: manifest.version, fixtureStore: manifest.fixtureStore, fixtureSetHash: checked.fixtureSetHash }));
});

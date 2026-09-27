"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createFileManifestSource, createMarionLearningManifestRegistry } = require("../../../Data/marion/runtime/learning/MarionLearningManifestRegistry");
const { createMarionLearningOfflineRunner } = require("../../../Data/marion/runtime/learning/MarionLearningOfflineRunner");
const { createMarionLearningRuntime } = require("../../../Data/marion/runtime/learning/MarionLearningRuntime");

const OWNER = { authenticated: true, role: "owner", actorId: "owner-1", verifiedBy: "server_middleware" };
const caseIds = Array.from({ length: 20 }, (_, i) => `case-${i + 1}`);
const manifest = { datasetId: "dataset-1", version: "v1", fixtureStore: "fixture-store-1", cases: caseIds.map(caseId => ({ caseId })) };
const fixtureSetHash = "b".repeat(64);

function registryHarness({ fixtureSetValid = true, reviewApproved = true, sourceManifest = manifest } = {}) {
  const records = new Map();
  const audit = [];
  const manifestSource = {
    async load(datasetId, version) {
      if (sourceManifest.datasetId !== datasetId || sourceManifest.version !== version) throw new Error("missing");
      return sourceManifest;
    },
    async list() { return [sourceManifest]; }
  };
  const registrationStore = {
    async get(key) { return records.get(key) || null; },
    async putIfAbsent(key, value) { if (records.has(key)) return false; records.set(key, value); return true; },
    async getRevocation(key) { return records.get(`${key}#revoked`) || null; },
    async putRevocationIfAbsent(key, value) { if (records.has(`${key}#revoked`)) return false; records.set(`${key}#revoked`, value); return true; },
    async listApproved(scope) { return [...records.values()].filter(record => record.status === "approved" && (!scope || record.scope === scope)); }
  };
  const verifyFixtureSet = async ({ datasetId, version, fixtureStore, caseIds: ids }) => ({
    ok: fixtureSetValid, syntheticOnly: fixtureSetValid, datasetId, version,
    fixtureStore: fixtureSetValid ? fixtureStore : "different-store", caseCount: ids.length,
    fixtureSetHash
  });
  const verifyFixtureReview = async request => ({
    approved: reviewApproved, reviewRef: request.reviewRef, reviewId: "review-record-1",
    datasetId: request.datasetId, version: request.version, scope: request.scope,
    fixtureStore: request.fixtureStore, manifestHash: request.manifestHash,
    fixtureSetHash: request.fixtureSetHash
  });
  const registry = createMarionLearningManifestRegistry({
    manifestSource, registrationStore, verifyFixtureSet, verifyFixtureReview,
    auditStore: { async append(event) { audit.push(event); } }
  });
  return { registry, records, audit };
}

async function approve(registry) {
  return registry.approveManifest({ datasetId: manifest.datasetId, version: manifest.version,
    scope: "retrieval", reviewRef: "review-1" }, OWNER);
}

test("manifest is not selectable until exact fixture-bound approval is durably registered", async () => {
  const { registry, records, audit } = registryHarness();
  assert.equal((await registry.selectApprovedManifest({ datasetId: "dataset-1", version: "v1", scope: "retrieval" }, OWNER)).reason, "manifest_not_registered");
  const approved = await approve(registry);
  assert.equal(approved.status, "approved");
  assert.equal(records.size, 1);
  assert.equal(audit[0].fixtureStore, "fixture-store-1");
  const selected = await registry.selectApprovedManifest({ datasetId: "dataset-1", version: "v1", scope: "retrieval" }, OWNER);
  assert.equal(selected.ok, true);
  assert.equal(selected.registration.fixtureSetHash, fixtureSetHash);
  assert.deepEqual(selected.evaluationContext.caseIds, caseIds);
  assert.equal(await registry.authorizeEvaluation({ mode: "offline", ...selected.evaluationContext }), true);
  const revoked = await registry.revokeManifest({ datasetId: "dataset-1", version: "v1", reasonCode: "fixture_review_invalidated" }, OWNER);
  assert.equal(revoked.status, "revoked");
  assert.equal(await registry.authorizeEvaluation({ mode: "offline", ...selected.evaluationContext }), false);
  assert.equal((await registry.selectApprovedManifest({ datasetId: "dataset-1", version: "v1", scope: "retrieval" }, OWNER)).reason, "manifest_registration_revoked");
});

test("approval requires middleware-verified owner authentication and a verified fixture review", async () => {
  const { registry: unauth } = registryHarness();
  assert.equal((await unauth.approveManifest({ datasetId: "dataset-1", version: "v1", scope: "retrieval", reviewRef: "review-1" }, { ...OWNER, verifiedBy: "client" })).reason, "owner_authentication_required");
  const { registry } = registryHarness({ reviewApproved: false });
  assert.equal((await approve(registry)).reason, "fixture_review_not_approved");
  assert.equal((await registry.listApproved("retrieval", OWNER)).registrations.length, 0);
});

test("registration locks exact manifest hash and fixture-store mapping", async () => {
  const { registry: brokenFixtureSet } = registryHarness({ fixtureSetValid: false });
  assert.equal((await approve(brokenFixtureSet)).reason, "fixture_set_not_verified");
  const { registry, records } = registryHarness({ sourceManifest: manifest });
  await approve(registry);
  const key = "dataset-1@v1";
  assert.equal(records.get(key).fixtureStore, "fixture-store-1");
  const tamperedSource = { ...manifest, version: "v1", fixtureStore: "different-store" };
  // Simulate a source edit after approval. Selection refuses changed bytes/binding.
  const tamperHarness = registryHarness({ sourceManifest: tamperedSource });
  tamperHarness.records.set(key, records.get(key));
  assert.equal((await tamperHarness.registry.selectApprovedManifest({ datasetId: "dataset-1", version: "v1", scope: "retrieval" }, OWNER)).reason, "registered_manifest_mismatch");
});

test("offline runner authorizes the exact registration before resolving code or loading fixtures", async () => {
  const { registry } = registryHarness();
  await approve(registry);
  const selected = await registry.selectApprovedManifest({ datasetId: "dataset-1", version: "v1", scope: "retrieval" }, OWNER);
  let loadCount = 0;
  const runner = createMarionLearningOfflineRunner({
    authorizeEvaluation: registry.authorizeEvaluation,
    resolveVersion: async () => ({ mode: "offline", async runOffline(input, options) {
      assert.equal(options.sideEffectsAllowed, false); return input.answer;
    } }),
    loadFixture: async (caseId, context) => {
      loadCount++;
      return { caseId, synthetic: true, datasetId: context.datasetId, datasetVersion: context.datasetVersion,
        fixtureStore: context.fixtureStore, fixtureSetHash: context.fixtureSetHash,
        input: { answer: "synthetic" } };
    },
    scoreFixture: async (_fixture, output) => ({ score: output === "synthetic" ? 1 : 0 })
  });
  const result = await runner.runVersion("candidate-1", caseIds, { mode: "offline", ...selected.evaluationContext });
  assert.equal(result.completed, true);
  assert.equal(loadCount, 20);
  await assert.rejects(runner.runVersion("candidate-1", caseIds, { mode: "offline", ...selected.evaluationContext, fixtureStore: "wrong-store" }), /manifest_not_registered/);
  assert.equal(loadCount, 20);
});


test("file manifest source loads exact drafts and fails closed on duplicate dataset versions", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "marion-manifest-source-"));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "drafts"));
  await fs.mkdir(path.join(root, "approved"));
  await fs.writeFile(path.join(root, "drafts", "retrieval.manifest.json"), JSON.stringify(manifest));
  const source = createFileManifestSource({ directory: root });
  assert.deepEqual(await source.load("dataset-1", "v1"), manifest);
  await fs.writeFile(path.join(root, "approved", "retrieval.manifest.json"), JSON.stringify(manifest));
  await assert.rejects(source.load("dataset-1", "v1"), /duplicate_manifest_identity/);
});


test("owner runtime selects the registered manifest and passes it with registration to the evaluator", async () => {
  const { registry } = registryHarness();
  await approve(registry);
  let received;
  const runtime = createMarionLearningRuntime({
    signalAdapter: { async record() { return { ok: true }; } },
    evaluator: { async evaluate(candidate, selectedManifest, registration) { received = { candidate, selectedManifest, registration }; return { ok: true, report: { validated: true } }; } },
    approvalGate: { async submitEvaluation() { return { ok: true }; }, async decide() { return { ok: true }; } },
    manifestRegistry: registry
  });
  const candidate = { datasetId: "dataset-1", datasetVersion: "v1", scope: "retrieval" };
  const result = await runtime.evaluateCandidate(candidate, { datasetId: "dataset-1", version: "v1", scope: "retrieval" }, OWNER);
  assert.equal(result.report.validated, true);
  assert.deepEqual(received.candidate, candidate);
  assert.deepEqual(received.selectedManifest, manifest);
  assert.equal(received.registration.manifestHash.length, 64);
  assert.equal(received.registration.fixtureSetHash, fixtureSetHash);
});


test("packaged draft manifests are discoverable and validate as external-reference sets", async () => {
  const manifestDir = path.resolve(__dirname, "../../../Data/marion/runtime/learning/manifests");
  const source = createFileManifestSource({ directory: manifestDir });
  const drafts = await source.list();
  assert.equal(drafts.length, 3);
  assert.deepEqual(drafts.map(item => item.datasetId).sort(), [
    "marion.response-style.synthetic.v2", "marion.retrieval.synthetic.v2", "marion.routing.synthetic.v2"
  ]);
  const expectedCounts = {
    "marion.retrieval.synthetic.v2": 67,
    "marion.routing.synthetic.v2": 67,
    "marion.response-style.synthetic.v2": 66
  };
  for (const item of drafts) {
    assert.equal(item.cases.length, expectedCounts[item.datasetId]);
    assert.equal(new Set(item.cases.map(testCase => testCase.caseId)).size, item.cases.length);
  }
});

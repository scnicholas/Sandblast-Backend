"use strict";

// Read-only content-addressed fixture loader. Approval is deliberately delegated
// to the host's trusted review service; a synthetic marker alone is not approval.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Dataset = require("./MarionLearningDataset");
const FixtureContract = require("./MarionLearningFixtureContract");
const VERSION = "marion.learningFixtureStore/1.2-contract-bound";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const MAX_FIXTURE_BYTES = 128 * 1024;
const ALLOWED_SCOPES = new Set(["retrieval", "routing", "response_style"]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function hashFixtureSet(datasetId, version, fixtureStore, fixtures) {
  const content = fixtures.map(item => {
    const copy = { ...item };
    delete copy.fixtureSetHash;
    return copy;
  });
  return crypto.createHash("sha256").update(stableJson({ datasetId, version, fixtureStore, fixtures: content })).digest("hex");
}
function plainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }

function createMarionLearningFixtureStore({ directory } = {}) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) throw new TypeError("fixture directory must be an absolute path");
  const root = path.resolve(directory);
  async function read(store, caseId) {
    if (!ID_RE.test(store || "") || !ID_RE.test(caseId || "")) throw new Error("invalid_fixture_reference");
    const rootStat = await fs.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("fixture_root_must_be_real_directory");
    const storeDir = path.join(root, store);
    const rootReal = await fs.realpath(root);
    const storeStat = await fs.lstat(storeDir);
    if (!storeStat.isDirectory() || storeStat.isSymbolicLink() || await fs.realpath(storeDir) !== path.join(rootReal, store)) throw new Error("fixture_store_path_invalid");
    const filePath = path.join(storeDir, `${caseId}.json`);
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FIXTURE_BYTES) throw new Error("fixture_file_invalid");
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!plainObject(parsed)) throw new Error("fixture_shape_invalid");
    return parsed;
  }
  async function verifyFixtureSet({ datasetId, version, fixtureStore, caseIds } = {}) {
    try {
      if (!ID_RE.test(datasetId || "") || !ID_RE.test(version || "") || !ID_RE.test(fixtureStore || "") || !Array.isArray(caseIds) || caseIds.length < Dataset.MINIMUM_CASES || caseIds.length > Dataset.MAXIMUM_CASES || new Set(caseIds).size !== caseIds.length) return { ok: false };
      const fixtures = [];
      let scope = "";
      for (const id of caseIds) {
        const fixture = await read(fixtureStore, id);
        const contract = FixtureContract.validateFixture(fixture);
        if (!contract || contract.ok !== true || fixture.caseId !== id || fixture.synthetic !== true ||
            fixture.datasetId !== datasetId || fixture.datasetVersion !== version ||
            fixture.fixtureStore !== fixtureStore || !plainObject(fixture.input) || !plainObject(fixture.reference)) return { ok: false };
        if (!ALLOWED_SCOPES.has(fixture.scope) || (scope && fixture.scope !== scope)) return { ok: false };
        scope = fixture.scope;
        fixtures.push(fixture);
      }
      const fixtureSetHash = hashFixtureSet(datasetId, version, fixtureStore, fixtures);
      if (fixtures.some(f => f.fixtureSetHash !== fixtureSetHash)) return { ok: false };
      return { ok: true, syntheticOnly: true, datasetId, version, fixtureStore, scope, caseCount: fixtures.length, fixtureSetHash };
    } catch (_) { return { ok: false }; }
  }
  async function loadFixture(caseId, context = {}) {
    const fixture = await read(context.fixtureStore, caseId);
    const contract = FixtureContract.validateFixture(fixture);
    if (!contract || contract.ok !== true) throw new Error("fixture_contract_invalid");
    if (fixture.datasetId !== context.datasetId || fixture.datasetVersion !== context.datasetVersion ||
        fixture.fixtureStore !== context.fixtureStore || fixture.scope !== context.scope ||
        fixture.fixtureSetHash !== context.fixtureSetHash) throw new Error("fixture_binding_mismatch");
    return fixture;
  }
  return Object.freeze({ VERSION, directory: root, verifyFixtureSet, loadFixture });
}

module.exports = { VERSION, createMarionLearningFixtureStore, hashFixtureSet };

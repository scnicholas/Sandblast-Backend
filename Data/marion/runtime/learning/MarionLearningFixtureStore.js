"use strict";

// Read-only synthetic fixture store. Registry/review authorization is enforced by
// the trusted host. This module verifies actual fixture CONTENT before release.
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Dataset = require("./MarionLearningDataset");
const FixtureContract = require("./MarionLearningFixtureContract");
const VERSION = "marion.learningFixtureStore/1.4-phase20-22-content-verification";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const MAX_FIXTURE_BYTES = 128 * 1024;
const ALLOWED_SCOPES = new Set(["retrieval", "routing", "response_style"]);

// Keep the legacy content-addressing format byte-for-byte compatible.
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function hashFixtureSet(datasetId, version, fixtureStore, fixtures) {
  const content = fixtures.map(item => {
    const copy = { ...item };
    delete copy.fixtureSetHash;
    return copy;
  });
  return crypto.createHash("sha256")
    .update(stableJson({ datasetId, version, fixtureStore, fixtures: content }))
    .digest("hex");
}
function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function validId(value) { return typeof value === "string" && ID_RE.test(value); }
function validCaseIds(ids) {
  return Array.isArray(ids) && ids.length >= Dataset.MINIMUM_CASES &&
    ids.length <= Dataset.MAXIMUM_CASES && ids.every(validId) &&
    new Set(ids).size === ids.length;
}
function validRequest({ datasetId, version, fixtureStore, caseIds } = {}) {
  return validId(datasetId) && validId(version) && validId(fixtureStore) && validCaseIds(caseIds);
}
function validFixture(fixture, id, datasetId, version, fixtureStore, scope = "") {
  if (!plainObject(fixture) || fixture.caseId !== id || fixture.synthetic !== true ||
      fixture.datasetId !== datasetId || fixture.datasetVersion !== version ||
      fixture.fixtureStore !== fixtureStore || !plainObject(fixture.input) ||
      !plainObject(fixture.reference) || !ALLOWED_SCOPES.has(fixture.scope) ||
      (scope && fixture.scope !== scope) || !HASH_RE.test(fixture.fixtureSetHash || "")) return false;
  try { return FixtureContract.validateFixture(fixture)?.ok === true; }
  catch (_) { return false; }
}
function verifiedSet(fixtures, { datasetId, version, fixtureStore, caseIds }, expectedHash) {
  if (fixtures.length !== caseIds.length) return { ok: false };
  let scope = "";
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    if (!validFixture(fixture, caseIds[i], datasetId, version, fixtureStore, scope)) return { ok: false };
    scope = fixture.scope;
  }
  const fixtureSetHash = hashFixtureSet(datasetId, version, fixtureStore, fixtures);
  if (expectedHash && fixtureSetHash !== expectedHash) return { ok: false };
  if (fixtures.some(f => f.fixtureSetHash !== fixtureSetHash)) return { ok: false };
  return Object.freeze({ ok: true, syntheticOnly: true, datasetId, version,
    fixtureStore, scope, caseCount: fixtures.length, fixtureSetHash,
    caseIds: Object.freeze([...caseIds]) });
}

function createMarionLearningFixtureStore({ directory } = {}) {
  if (typeof directory !== "string" || !path.isAbsolute(directory))
    throw new TypeError("fixture directory must be an absolute path");
  const root = path.resolve(directory);
  const noFollow = fsSync.constants.O_NOFOLLOW || 0;
  const readOnly = fsSync.constants.O_RDONLY;

  async function paths(store, caseId) {
    if (!validId(store) || !validId(caseId)) throw new Error("invalid_fixture_reference");
    const rootStat = await fs.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("fixture_root_must_be_real_directory");
    const rootReal = await fs.realpath(root);
    const storeDir = path.join(root, store);
    const storeStat = await fs.lstat(storeDir);
    if (!storeStat.isDirectory() || storeStat.isSymbolicLink() ||
        await fs.realpath(storeDir) !== path.join(rootReal, store)) throw new Error("fixture_store_path_invalid");
    return path.join(storeDir, `${caseId}.json`);
  }
  function pathsSync(store, caseId) {
    if (!validId(store) || !validId(caseId)) throw new Error("invalid_fixture_reference");
    const rootStat = fsSync.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("fixture_root_must_be_real_directory");
    const rootReal = fsSync.realpathSync(root);
    const storeDir = path.join(root, store);
    const storeStat = fsSync.lstatSync(storeDir);
    if (!storeStat.isDirectory() || storeStat.isSymbolicLink() ||
        fsSync.realpathSync(storeDir) !== path.join(rootReal, store)) throw new Error("fixture_store_path_invalid");
    return path.join(storeDir, `${caseId}.json`);
  }
  function parseFixture(buffer) {
    if (buffer.length === 0 || buffer.length > MAX_FIXTURE_BYTES) throw new Error("fixture_file_invalid");
    const parsed = JSON.parse(buffer.toString("utf8"));
    if (!plainObject(parsed)) throw new Error("fixture_shape_invalid");
    return parsed;
  }
  async function read(store, caseId) {
    const filePath = await paths(store, caseId);
    const handle = await fs.open(filePath, readOnly | noFollow);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_FIXTURE_BYTES) throw new Error("fixture_file_invalid");
      const bytes = Buffer.alloc(stat.size);
      let total = 0;
      while (total < stat.size) {
        const { bytesRead } = await handle.read(bytes, total, stat.size - total, total);
        if (!bytesRead) throw new Error("fixture_file_changed_during_read");
        total += bytesRead;
      }
      const after = await handle.stat();
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs)
        throw new Error("fixture_file_changed_during_read");
      return parseFixture(bytes);
    } finally { await handle.close(); }
  }
  function readSync(store, caseId) {
    const filePath = pathsSync(store, caseId);
    const fd = fsSync.openSync(filePath, readOnly | noFollow);
    try {
      const stat = fsSync.fstatSync(fd);
      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_FIXTURE_BYTES) throw new Error("fixture_file_invalid");
      const bytes = Buffer.alloc(stat.size);
      let total = 0;
      while (total < stat.size) {
        const n = fsSync.readSync(fd, bytes, total, stat.size - total, total);
        if (!n) throw new Error("fixture_file_changed_during_read");
        total += n;
      }
      const after = fsSync.fstatSync(fd);
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs)
        throw new Error("fixture_file_changed_during_read");
      return parseFixture(bytes);
    } finally { fsSync.closeSync(fd); }
  }
  async function verifyFixtureSet(request = {}) {
    try {
      if (!validRequest(request)) return { ok: false };
      const fixtures = [];
      for (const id of request.caseIds) fixtures.push(await read(request.fixtureStore, id));
      return verifiedSet(fixtures, request);
    } catch (_) { return { ok: false }; }
  }
  function verifyFixtureSetSync(request = {}) {
    try {
      if (!validRequest(request)) return { ok: false };
      const fixtures = request.caseIds.map(id => readSync(request.fixtureStore, id));
      return verifiedSet(fixtures, request);
    } catch (_) { return { ok: false }; }
  }
  async function loadFixture(caseId, context = {}) {
    // The runner supplies the full, ordered approved case IDs. An individual
    // fixture's claimed hash is not cryptographic proof of its own contents.
    if (!validId(caseId) || !context || context.mode !== "offline" ||
        !ALLOWED_SCOPES.has(context.scope) || !HASH_RE.test(context.fixtureSetHash || "") ||
        !validRequest({ datasetId: context.datasetId, version: context.datasetVersion,
          fixtureStore: context.fixtureStore, caseIds: context.caseIds }) ||
        !context.caseIds.includes(caseId)) throw new Error("fixture_binding_mismatch");
    const request = { datasetId: context.datasetId, version: context.datasetVersion,
      fixtureStore: context.fixtureStore, caseIds: context.caseIds };
    // Re-read the full set for each load: costly for large datasets, but this
    // prevents stale process caches from authorizing edited on-disk fixtures.
    const fixtures = [];
    for (const id of context.caseIds) fixtures.push(await read(context.fixtureStore, id));
    const verified = verifiedSet(fixtures, request, context.fixtureSetHash);
    if (!verified.ok || verified.scope !== context.scope) throw new Error("fixture_binding_mismatch");
    return fixtures[context.caseIds.indexOf(caseId)];
  }
  return Object.freeze({ VERSION, directory: root, verifyFixtureSet, verifyFixtureSetSync, loadFixture });
}
module.exports = { VERSION, createMarionLearningFixtureStore, hashFixtureSet };

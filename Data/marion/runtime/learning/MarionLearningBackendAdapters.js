"use strict";

// Durable, private file-backed adapters for Marion Learning.
// Production must point SB_MARION_LEARNING_DATA_DIR at a persistent mounted
// directory. This module intentionally has no in-memory fallback.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Policy = require("./MarionLearningPolicy");

const VERSION = "marion.learningBackendAdapters/1.1-durable-manifest-registry";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function backendAuditHash(previousHash, sequence, event) {
  return crypto.createHash("sha256")
    .update(`${previousHash}\n${sequence}\n${stableJson(event)}`)
    .digest("hex");
}

function ensurePrivateDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(dirPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("learning_data_dir_must_be_real_directory");
  fs.chmodSync(dirPath, 0o700);
}

function assertRegularFile(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("learning_store_file_must_be_regular");
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
  return true;
}

function readAuditTail(filePath) {
  if (!assertRegularFile(filePath)) return { sequence: 0, hash: "GENESIS" };
  const raw = fs.readFileSync(filePath, "utf8");
  let sequence = 0;
  let previousHash = "GENESIS";
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    let envelope;
    try { envelope = JSON.parse(line); } catch (_) { throw new Error("learning_audit_log_invalid_json"); }
    const expectedSequence = sequence + 1;
    const expectedHash = backendAuditHash(previousHash, expectedSequence, envelope.event);
    if (envelope.sequence !== expectedSequence || envelope.previousHash !== previousHash || envelope.eventHash !== expectedHash) {
      throw new Error("learning_audit_chain_verification_failed");
    }
    sequence = expectedSequence;
    previousHash = expectedHash;
  }
  return { sequence, hash: previousHash };
}

function createMarionLearningBackendAdapters({
  dataDir = process.env.SB_MARION_LEARNING_DATA_DIR,
  resolveVersion,
  loadFixture,
  scoreFixture,
  healthProbe
} = {}) {
  if (typeof dataDir !== "string" || !dataDir.trim() || !path.isAbsolute(dataDir)) {
    throw new TypeError("SB_MARION_LEARNING_DATA_DIR must be an absolute persistent mount path");
  }
  if (typeof resolveVersion !== "function" || typeof loadFixture !== "function" || typeof scoreFixture !== "function") {
    throw new TypeError("offline resolveVersion, loadFixture, and scoreFixture functions are required");
  }

  const root = path.resolve(dataDir);
  ensurePrivateDir(root);
  const signalsPath = path.join(root, "signals.jsonl");
  const auditPath = path.join(root, "audit.jsonl");
  const proposalsDir = path.join(root, "proposals");
  const registrationsDir = path.join(root, "manifest-registrations");
  const revocationsDir = path.join(root, "manifest-revocations");
  ensurePrivateDir(proposalsDir);
  ensurePrivateDir(registrationsDir);
  ensurePrivateDir(revocationsDir);
  assertRegularFile(signalsPath);
  assertRegularFile(auditPath);

  let appendQueue = Promise.resolve();
  const auditState = readAuditTail(auditPath);

  async function appendDurably(filePath, value) {
    const operation = appendQueue.then(async () => {
      assertRegularFile(filePath);
      const handle = await fsp.open(filePath, fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY, 0o600);
      try {
        await handle.chmod(0o600);
        await handle.write(`${JSON.stringify(value)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
    });
    appendQueue = operation.catch(() => undefined);
    return operation;
  }

  const signalStore = Object.freeze({
    async appendSignal(signal) {
      const checked = Policy.validateSignal(signal);
      if (!checked.ok) throw new TypeError(`invalid_learning_signal:${checked.reason}`);
      await appendDurably(signalsPath, checked.signal);
    }
  });

  const proposalStore = Object.freeze({
    async get(id) {
      const key = String(id || "");
      if (!ID_RE.test(key)) return null;
      const filePath = path.join(proposalsDir, `${key}.json`);
      if (!assertRegularFile(filePath)) return null;
      return JSON.parse(await fsp.readFile(filePath, "utf8"));
    },
    async set(id, record) {
      const key = String(id || "");
      if (!ID_RE.test(key) || !record || typeof record !== "object" || Array.isArray(record)) {
        throw new TypeError("invalid_learning_proposal");
      }
      const target = path.join(proposalsDir, `${key}.json`);
      assertRegularFile(target);
      const temporary = path.join(proposalsDir, `.${key}.${crypto.randomBytes(8).toString("hex")}.tmp`);
      const handle = await fsp.open(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
      try {
        await handle.writeFile(JSON.stringify(record));
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await fsp.rename(temporary, target);
        await fsp.chmod(target, 0o600);
      } catch (error) {
        try { await fsp.unlink(temporary); } catch (_) {}
        throw error;
      }
    }
  });

  function registrationFile(directory, key) {
    const digest = crypto.createHash("sha256").update(String(key)).digest("hex");
    return path.join(directory, `${digest}.json`);
  }

  async function atomicPutIfAbsent(target, record) {
    assertRegularFile(target);
    const temporary = path.join(path.dirname(target), `.record.${crypto.randomBytes(12).toString("hex")}.tmp`);
    const handle = await fsp.open(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
    try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); }
    finally { await handle.close(); }
    try {
      await fsp.link(temporary, target);
      await fsp.chmod(target, 0o600);
      await fsp.unlink(temporary);
      return true;
    } catch (error) {
      try { await fsp.unlink(temporary); } catch (_) {}
      if (error && error.code === "EEXIST") return false;
      throw error;
    }
  }

  const manifestRegistryStore = Object.freeze({
    async get(key) {
      const filePath = registrationFile(registrationsDir, key);
      if (!assertRegularFile(filePath)) return null;
      return JSON.parse(await fsp.readFile(filePath, "utf8"));
    },
    async putIfAbsent(key, record) {
      if (typeof key !== "string" || !record || record.status !== "approved" || !Array.isArray(record.caseIds)) throw new TypeError("invalid_manifest_registration");
      return atomicPutIfAbsent(registrationFile(registrationsDir, key), record);
    },
    async getRevocation(key) {
      const filePath = registrationFile(revocationsDir, key);
      if (!assertRegularFile(filePath)) return null;
      return JSON.parse(await fsp.readFile(filePath, "utf8"));
    },
    async putRevocationIfAbsent(key, record) {
      if (typeof key !== "string" || !record || record.status !== "revoked") throw new TypeError("invalid_manifest_revocation");
      return atomicPutIfAbsent(registrationFile(revocationsDir, key), record);
    },
    async listApproved(scope) {
      const names = await fsp.readdir(registrationsDir);
      const records = [];
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        const filePath = path.join(registrationsDir, name);
        if (!assertRegularFile(filePath)) continue;
        const record = JSON.parse(await fsp.readFile(filePath, "utf8"));
        if (record && record.status === "approved" && (!scope || record.scope === scope)) records.push(record);
      }
      return records;
    }
  });

  async function durableAuditAppend(event) {
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new TypeError("invalid_learning_audit_event");
    const sequence = auditState.sequence + 1;
    const envelope = {
      sequence,
      previousHash: auditState.hash,
      event,
      eventHash: backendAuditHash(auditState.hash, sequence, event)
    };
    await appendDurably(auditPath, envelope);
    auditState.sequence = sequence;
    auditState.hash = envelope.eventHash;
  }

  async function probe() {
    try {
      if (typeof healthProbe === "function") {
        const result = await healthProbe();
        if (!result || result.ready !== true) return { ready: false };
      }
      const [rootStat, signalsStat, auditStat, proposalStat, registrationStat, revocationStat] = await Promise.all([
        fsp.stat(root), fsp.stat(signalsPath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error)),
        fsp.stat(auditPath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error)),
        fsp.stat(proposalsDir), fsp.stat(registrationsDir), fsp.stat(revocationsDir)
      ]);
      const mode = rootStat.mode & 0o777;
      const directoriesPrivate = [proposalStat, registrationStat, revocationStat].every(stat => (stat.mode & 0o777) === 0o700);
      const filesPrivate = [signalsStat, auditStat].filter(Boolean).every(stat => (stat.mode & 0o077) === 0);
      return { ready: mode === 0o700 && directoriesPrivate && filesPrivate, storage: "private_persistent_files" };
    } catch (_) {
      return { ready: false };
    }
  }

  return Object.freeze({
    VERSION,
    signalStore,
    proposalStore,
    durableAuditAppend,
    manifestRegistryStore,
    resolveVersion, loadFixture, scoreFixture,
    healthProbe: probe,
    dataDir: root
  });
}

module.exports = { VERSION, createMarionLearningBackendAdapters };

"use strict";

// Neon/PostgreSQL durable storage adapters for Marion Learning.
// The app owns the Pool lifecycle; this module never logs credentials or data.
const crypto = require("node:crypto");
const Policy = require("./MarionLearningPolicy");

const VERSION = "marion.learningPostgresAdapters/1.2-durable-owner-review-store";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const OWNER_ACTOR_RE = /^owner:[a-f0-9]{24}$/;
const REVIEW_SCOPES = new Set(["retrieval", "routing", "response_style"]);
const REVIEW_RECORD_KEYS = new Set([
  "approved", "approvedBy", "caseCount", "caseIds", "datasetId", "fixtureSetHash",
  "fixtureStore", "manifestHash", "ownerConsent", "reviewId", "reviewRef", "scope",
  "signature", "version"
]);
const schemaReadyByPool = new WeakMap();

function normalizeAuditEvent(event) {
  let serialized;
  try {
    serialized = JSON.stringify(event);
  } catch (_) {
    throw new TypeError("audit_event_not_json_serializable");
  }
  if (typeof serialized !== "string") throw new TypeError("audit_event_not_json_serializable");
  let normalized;
  try {
    normalized = JSON.parse(serialized);
  } catch (_) {
    throw new TypeError("audit_event_not_json_serializable");
  }
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new TypeError("invalid_learning_audit_event");
  }
  return normalized;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function auditHash(previousHash, sequence, event) {
  return crypto.createHash("sha256")
    .update(`${previousHash}\n${sequence}\n${stableJson(event)}`)
    .digest("hex");
}

function hashKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}

function isValidReviewRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const keys = Object.keys(record);
  return Object.getPrototypeOf(record) === Object.prototype &&
    keys.length === REVIEW_RECORD_KEYS.size && keys.every(key => REVIEW_RECORD_KEYS.has(key)) &&
    record.approved === true && record.ownerConsent === true &&
    ID_RE.test(record.reviewRef || "") && ID_RE.test(record.reviewId || "") &&
    OWNER_ACTOR_RE.test(record.approvedBy || "") && ID_RE.test(record.datasetId || "") &&
    ID_RE.test(record.version || "") && ID_RE.test(record.fixtureStore || "") &&
    REVIEW_SCOPES.has(record.scope) && HASH_RE.test(record.manifestHash || "") &&
    HASH_RE.test(record.fixtureSetHash || "") && HASH_RE.test(record.signature || "") &&
    Array.isArray(record.caseIds) && record.caseIds.length >= 20 && record.caseIds.length <= 500 &&
    Number.isSafeInteger(record.caseCount) && record.caseCount === record.caseIds.length &&
    new Set(record.caseIds).size === record.caseIds.length &&
    record.caseIds.every(id => typeof id === "string" && ID_RE.test(id));
}

function auditEventForReview(record) {
  return {
    type: "learning_fixture_review",
    action: "issue_owner_fixture_review",
    reviewRef: record.reviewRef,
    reviewId: record.reviewId,
    datasetId: record.datasetId,
    version: record.version,
    scope: record.scope,
    fixtureStore: record.fixtureStore,
    manifestHash: record.manifestHash,
    fixtureSetHash: record.fixtureSetHash,
    caseCount: record.caseCount,
    approvedBy: record.approvedBy,
    signatureHash: crypto.createHash("sha256").update(record.signature).digest("hex")
  };
}

async function ensureSchema(pool) {
  let pending = schemaReadyByPool.get(pool);
  if (!pending) {
    pending = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS marion_learning_signals (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        signal JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS marion_learning_proposals (
        proposal_id TEXT PRIMARY KEY,
        record JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS marion_learning_manifest_registrations (
        key_hash CHAR(64) PRIMARY KEY,
        record JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS marion_learning_manifest_revocations (
        key_hash CHAR(64) PRIMARY KEY,
        record JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS marion_learning_audit_state (
        singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
        sequence BIGINT NOT NULL,
        event_hash TEXT NOT NULL
      )`);
      await pool.query(`INSERT INTO marion_learning_audit_state (singleton, sequence, event_hash)
        VALUES (TRUE, 0, 'GENESIS') ON CONFLICT (singleton) DO NOTHING`);
      await pool.query(`CREATE TABLE IF NOT EXISTS marion_learning_audit (
        sequence BIGINT PRIMARY KEY,
        previous_hash TEXT NOT NULL,
        event JSONB NOT NULL,
        event_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS marion_learning_fixture_reviews (
        review_ref TEXT PRIMARY KEY,
        record JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      return true;
    })();
    schemaReadyByPool.set(pool, pending);
    pending.catch(() => { schemaReadyByPool.delete(pool); });
  }
  return pending;
}

// Runtime operations and readiness checks must never create or alter tables.
// Schema changes are available only through the explicit initializer export.
async function readSchemaPresence(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("a PostgreSQL Pool is required");
  }
  const result = await pool.query(`SELECT
    to_regclass('marion_learning_signals') IS NOT NULL AS signals_exists,
    to_regclass('marion_learning_proposals') IS NOT NULL AS proposals_exists,
    to_regclass('marion_learning_manifest_registrations') IS NOT NULL AS registrations_exists,
    to_regclass('marion_learning_manifest_revocations') IS NOT NULL AS revocations_exists,
    to_regclass('marion_learning_audit_state') IS NOT NULL AS audit_state_exists,
    to_regclass('marion_learning_audit') IS NOT NULL AS audit_exists,
    to_regclass('marion_learning_fixture_reviews') IS NOT NULL AS reviews_exists`);
  return result && Array.isArray(result.rows) ? result.rows[0] || null : null;
}

function hasCoreSchema(row) {
  const required = [
    "signals_exists",
    "proposals_exists",
    "registrations_exists",
    "revocations_exists",
    "audit_state_exists",
    "audit_exists"
  ];
  return !!row && required.every(key => row[key] === true);
}

async function assertSchema(pool) {
  const row = await readSchemaPresence(pool);
  if (!hasCoreSchema(row) || row.reviews_exists !== true) {
    throw new Error("marion_learning_schema_not_initialized");
  }
  return true;
}

async function verifyAuditChain(pool) {
  const stateResult = await pool.query(
    "SELECT sequence, event_hash FROM marion_learning_audit_state WHERE singleton = TRUE"
  );
  if (stateResult.rowCount !== 1) return false;
  let sequence = 0;
  let previousHash = "GENESIS";
  const rows = await pool.query(
    "SELECT sequence, previous_hash, event, event_hash FROM marion_learning_audit ORDER BY sequence ASC"
  );
  for (const row of rows.rows) {
    sequence += 1;
    const expectedHash = auditHash(previousHash, sequence, row.event);
    if (Number(row.sequence) !== sequence || row.previous_hash !== previousHash || row.event_hash !== expectedHash) return false;
    previousHash = expectedHash;
  }
  const state = stateResult.rows[0];
  return Number(state.sequence) === sequence && state.event_hash === previousHash;
}

async function probeMarionLearningPostgres(pool) {
  if (!pool || typeof pool.query !== "function") return { ready: false, storage: "postgresql" };
  try {
    await pool.query("SELECT 1");
    const schema = await readSchemaPresence(pool);
    const reviewStoreReady = !!schema && schema.reviews_exists === true;
    if (!hasCoreSchema(schema)) {
      return { ready: false, coreReady: false, reviewStoreReady, storage: "postgresql", reason: "learning_schema_missing" };
    }
    const auditReady = await verifyAuditChain(pool);
    if (!auditReady) {
      return { ready: false, coreReady: false, reviewStoreReady, storage: "postgresql", reason: "learning_audit_chain_invalid" };
    }
    if (!reviewStoreReady) {
      return { ready: false, coreReady: true, reviewStoreReady: false, storage: "postgresql", reason: "review_store_schema_missing" };
    }
    await pool.query("SELECT review_ref, record FROM marion_learning_fixture_reviews LIMIT 0");
    return { ready: true, coreReady: true, reviewStoreReady: true, storage: "postgresql", reason: "evaluation_storage_ready" };
  } catch (_) {
    return { ready: false, coreReady: false, reviewStoreReady: false, storage: "postgresql", reason: "postgres_probe_failed" };
  }
}

function createMarionLearningPostgresAdapters({ pool, resolveVersion, loadFixture, scoreFixture } = {}) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new TypeError("a PostgreSQL Pool is required");
  }
  if (typeof resolveVersion !== "function" || typeof loadFixture !== "function" || typeof scoreFixture !== "function") {
    throw new TypeError("offline resolveVersion, loadFixture, and scoreFixture functions are required");
  }

  const signalStore = Object.freeze({
    async appendSignal(signal) {
      const checked = Policy.validateSignal(signal);
      if (!checked.ok) throw new TypeError(`invalid_learning_signal:${checked.reason}`);
      await assertSchema(pool);
      await pool.query("INSERT INTO marion_learning_signals (signal) VALUES ($1::jsonb)", [JSON.stringify(checked.signal)]);
    }
  });

  const proposalStore = Object.freeze({
    async get(id) {
      const key = String(id || "");
      if (!ID_RE.test(key)) return null;
      await assertSchema(pool);
      const result = await pool.query("SELECT record FROM marion_learning_proposals WHERE proposal_id = $1", [key]);
      return result.rowCount ? result.rows[0].record : null;
    },
    async set(id, record) {
      const key = String(id || "");
      if (!ID_RE.test(key) || !record || typeof record !== "object" || Array.isArray(record)) {
        throw new TypeError("invalid_learning_proposal");
      }
      await assertSchema(pool);
      await pool.query(`INSERT INTO marion_learning_proposals (proposal_id, record)
        VALUES ($1, $2::jsonb) ON CONFLICT (proposal_id) DO UPDATE
        SET record = EXCLUDED.record, updated_at = NOW()`, [key, JSON.stringify(record)]);
    }
  });

  const manifestRegistryStore = Object.freeze({
    async get(key) {
      await assertSchema(pool);
      const result = await pool.query("SELECT record FROM marion_learning_manifest_registrations WHERE key_hash = $1", [hashKey(key)]);
      return result.rowCount ? result.rows[0].record : null;
    },
    async putIfAbsent(key, record) {
      if (typeof key !== "string" || !record || record.status !== "approved" || !Array.isArray(record.caseIds)) {
        throw new TypeError("invalid_manifest_registration");
      }
      await assertSchema(pool);
      const result = await pool.query(`INSERT INTO marion_learning_manifest_registrations (key_hash, record)
        VALUES ($1, $2::jsonb) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash`, [hashKey(key), JSON.stringify(record)]);
      return result.rowCount === 1;
    },
    async getRevocation(key) {
      await assertSchema(pool);
      const result = await pool.query("SELECT record FROM marion_learning_manifest_revocations WHERE key_hash = $1", [hashKey(key)]);
      return result.rowCount ? result.rows[0].record : null;
    },
    async putRevocationIfAbsent(key, record) {
      if (typeof key !== "string" || !record || record.status !== "revoked") throw new TypeError("invalid_manifest_revocation");
      await assertSchema(pool);
      const result = await pool.query(`INSERT INTO marion_learning_manifest_revocations (key_hash, record)
        VALUES ($1, $2::jsonb) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash`, [hashKey(key), JSON.stringify(record)]);
      return result.rowCount === 1;
    },
    async listApproved(scope) {
      await assertSchema(pool);
      const result = await pool.query(`SELECT record FROM marion_learning_manifest_registrations
        WHERE record->>'status' = 'approved' AND ($1::text IS NULL OR record->>'scope' = $1)
        ORDER BY created_at ASC`, [scope || null]);
      return result.rows.map(row => row.record);
    }
  });

  async function getReview(reviewRef) {
    const key = String(reviewRef || "");
    if (!ID_RE.test(key)) return null;
    await assertSchema(pool);
    const result = await pool.query(
      "SELECT record FROM marion_learning_fixture_reviews WHERE review_ref = $1",
      [key]
    );
    return result.rowCount ? result.rows[0].record : null;
  }

  // The signed review is immutable, durable, and audited in the same database
  // transaction so an unaudited approval record cannot become usable.
  const reviewStore = Object.freeze({
    get: getReview,
    getReview,
    async insertIfAbsent(record) {
      if (!isValidReviewRecord(record)) throw new TypeError("invalid_signed_fixture_review");
      await assertSchema(pool);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(`INSERT INTO marion_learning_fixture_reviews (review_ref, record)
          VALUES ($1, $2::jsonb) ON CONFLICT (review_ref) DO NOTHING RETURNING review_ref`,
          [record.reviewRef, JSON.stringify(record)]);
        if (inserted.rowCount !== 1) {
          await client.query("ROLLBACK");
          return false;
        }
        await appendAuditWithClient(client, auditEventForReview(record));
        await client.query("COMMIT");
        return true;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        throw error;
      } finally {
        client.release();
      }
    }
  });

  async function appendAuditWithClient(client, event) {
    const stateResult = await client.query("SELECT sequence, event_hash FROM marion_learning_audit_state WHERE singleton = TRUE FOR UPDATE");
    if (stateResult.rowCount !== 1) throw new Error("learning_audit_state_missing");
    const state = stateResult.rows[0];
    const sequence = Number(state.sequence) + 1;
    const previousHash = state.event_hash;
    const normalizedEvent = normalizeAuditEvent(event);
    const eventHash = auditHash(previousHash, sequence, normalizedEvent);
    await client.query("INSERT INTO marion_learning_audit (sequence, previous_hash, event, event_hash) VALUES ($1, $2, $3::jsonb, $4)",
      [sequence, previousHash, JSON.stringify(normalizedEvent), eventHash]);
    await client.query("UPDATE marion_learning_audit_state SET sequence = $1, event_hash = $2 WHERE singleton = TRUE", [sequence, eventHash]);
  }

  async function durableAuditAppend(event) {
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new TypeError("invalid_learning_audit_event");
    await assertSchema(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await appendAuditWithClient(client, event);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
  }

  return Object.freeze({
    VERSION,
    signalStore,
    proposalStore,
    durableAuditAppend,
    manifestRegistryStore,
    reviewStore,
    resolveVersion,
    loadFixture,
    scoreFixture,
    healthProbe: () => probeMarionLearningPostgres(pool)
  });
}

async function initializeMarionLearningPostgresSchema(pool) {
  await ensureSchema(pool);
  // Force a catalog check after DDL rather than trusting the initializer's writes.
  await assertSchema(pool);
  return { ready: true, storage: "postgresql" };
}

module.exports = {
  VERSION,
  createMarionLearningPostgresAdapters,
  initializeMarionLearningPostgresSchema,
  probeMarionLearningPostgres
};

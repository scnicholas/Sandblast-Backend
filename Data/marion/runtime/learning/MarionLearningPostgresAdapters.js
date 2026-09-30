"use strict";

// Neon/PostgreSQL durable storage adapters for Marion Learning.
// The app owns the Pool lifecycle; this module never logs credentials or data.
const crypto = require("node:crypto");
const Policy = require("./MarionLearningPolicy");

const VERSION = "marion.learningPostgresAdapters/1.0-neon";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const schemaReadyByPool = new WeakMap();

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
      return true;
    })();
    schemaReadyByPool.set(pool, pending);
    pending.catch(() => { schemaReadyByPool.delete(pool); });
  }
  return pending;
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
    await ensureSchema(pool);
    await pool.query("SELECT 1");
    const auditReady = await verifyAuditChain(pool);
    return { ready: auditReady, storage: "postgresql" };
  } catch (_) {
    return { ready: false, storage: "postgresql" };
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
      await ensureSchema(pool);
      await pool.query("INSERT INTO marion_learning_signals (signal) VALUES ($1::jsonb)", [JSON.stringify(checked.signal)]);
    }
  });

  const proposalStore = Object.freeze({
    async get(id) {
      const key = String(id || "");
      if (!ID_RE.test(key)) return null;
      await ensureSchema(pool);
      const result = await pool.query("SELECT record FROM marion_learning_proposals WHERE proposal_id = $1", [key]);
      return result.rowCount ? result.rows[0].record : null;
    },
    async set(id, record) {
      const key = String(id || "");
      if (!ID_RE.test(key) || !record || typeof record !== "object" || Array.isArray(record)) {
        throw new TypeError("invalid_learning_proposal");
      }
      await ensureSchema(pool);
      await pool.query(`INSERT INTO marion_learning_proposals (proposal_id, record)
        VALUES ($1, $2::jsonb) ON CONFLICT (proposal_id) DO UPDATE
        SET record = EXCLUDED.record, updated_at = NOW()`, [key, JSON.stringify(record)]);
    }
  });

  const manifestRegistryStore = Object.freeze({
    async get(key) {
      await ensureSchema(pool);
      const result = await pool.query("SELECT record FROM marion_learning_manifest_registrations WHERE key_hash = $1", [hashKey(key)]);
      return result.rowCount ? result.rows[0].record : null;
    },
    async putIfAbsent(key, record) {
      if (typeof key !== "string" || !record || record.status !== "approved" || !Array.isArray(record.caseIds)) {
        throw new TypeError("invalid_manifest_registration");
      }
      await ensureSchema(pool);
      const result = await pool.query(`INSERT INTO marion_learning_manifest_registrations (key_hash, record)
        VALUES ($1, $2::jsonb) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash`, [hashKey(key), JSON.stringify(record)]);
      return result.rowCount === 1;
    },
    async getRevocation(key) {
      await ensureSchema(pool);
      const result = await pool.query("SELECT record FROM marion_learning_manifest_revocations WHERE key_hash = $1", [hashKey(key)]);
      return result.rowCount ? result.rows[0].record : null;
    },
    async putRevocationIfAbsent(key, record) {
      if (typeof key !== "string" || !record || record.status !== "revoked") throw new TypeError("invalid_manifest_revocation");
      await ensureSchema(pool);
      const result = await pool.query(`INSERT INTO marion_learning_manifest_revocations (key_hash, record)
        VALUES ($1, $2::jsonb) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash`, [hashKey(key), JSON.stringify(record)]);
      return result.rowCount === 1;
    },
    async listApproved(scope) {
      await ensureSchema(pool);
      const result = await pool.query(`SELECT record FROM marion_learning_manifest_registrations
        WHERE record->>'status' = 'approved' AND ($1::text IS NULL OR record->>'scope' = $1)
        ORDER BY created_at ASC`, [scope || null]);
      return result.rows.map(row => row.record);
    }
  });

  async function durableAuditAppend(event) {
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new TypeError("invalid_learning_audit_event");
    await ensureSchema(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const stateResult = await client.query("SELECT sequence, event_hash FROM marion_learning_audit_state WHERE singleton = TRUE FOR UPDATE");
      if (stateResult.rowCount !== 1) throw new Error("learning_audit_state_missing");
      const state = stateResult.rows[0];
      const sequence = Number(state.sequence) + 1;
      const previousHash = state.event_hash;
      const eventHash = auditHash(previousHash, sequence, event);
      await client.query("INSERT INTO marion_learning_audit (sequence, previous_hash, event, event_hash) VALUES ($1, $2, $3::jsonb, $4)",
        [sequence, previousHash, JSON.stringify(event), eventHash]);
      await client.query("UPDATE marion_learning_audit_state SET sequence = $1, event_hash = $2 WHERE singleton = TRUE", [sequence, eventHash]);
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
    resolveVersion,
    loadFixture,
    scoreFixture,
    healthProbe: () => probeMarionLearningPostgres(pool)
  });
}

module.exports = { VERSION, createMarionLearningPostgresAdapters, probeMarionLearningPostgres };

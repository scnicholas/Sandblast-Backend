"use strict";

// Neon/PostgreSQL durable storage adapters for Marion Learning.
// The app owns the Pool lifecycle; this module never logs credentials or data.
const crypto = require("node:crypto");
const Policy = require("./MarionLearningPolicy");

const VERSION = "marion.learningPostgresAdapters/1.2-explicit-schema-safe-audit-json";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const schemaReadyByPool = new WeakMap();
const REQUIRED_SCHEMA_CHECKS = Object.freeze([
  ["signals", "marion_learning_signals"],
  ["proposals", "marion_learning_proposals"],
  ["registrations", "marion_learning_manifest_registrations"],
  ["revocations", "marion_learning_manifest_revocations"],
  ["audit_state", "marion_learning_audit_state"],
  ["audit", "marion_learning_audit"]
]);

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

function manifestKeyHash(key) {
  if (typeof key !== "string" || key.length === 0 || Buffer.byteLength(key, "utf8") > 4096) {
    throw new TypeError("invalid_manifest_key");
  }
  return hashKey(key);
}

const SCHEMA_STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS marion_learning_signals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    signal JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS marion_learning_proposals (
    proposal_id TEXT PRIMARY KEY,
    record JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS marion_learning_manifest_registrations (
    key_hash CHAR(64) PRIMARY KEY,
    record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS marion_learning_manifest_revocations (
    key_hash CHAR(64) PRIMARY KEY,
    record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS marion_learning_audit_state (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    sequence BIGINT NOT NULL,
    event_hash TEXT NOT NULL
  )`,
  `INSERT INTO marion_learning_audit_state (singleton, sequence, event_hash)
    VALUES (TRUE, 0, 'GENESIS') ON CONFLICT (singleton) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS marion_learning_audit (
    sequence BIGINT PRIMARY KEY,
    previous_hash TEXT NOT NULL,
    event JSONB NOT NULL,
    event_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
]);

async function initializeMarionLearningPostgresSchema(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("a PostgreSQL Pool with connect() is required for schema initialization");
  }
  let pending = schemaReadyByPool.get(pool);
  if (!pending) {
    pending = (async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const statement of SCHEMA_STATEMENTS) await client.query(statement);
        await client.query("COMMIT");
        return true;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        throw error;
      } finally {
        client.release();
      }
    })();
    schemaReadyByPool.set(pool, pending);
    pending.catch(() => { schemaReadyByPool.delete(pool); });
  }
  return pending;
}

function parseAuditSequence(value) {
  try {
    if (typeof value === "bigint") return value >= 0n ? value : null;
    const text = String(value);
    if (!/^(0|[1-9][0-9]*)$/.test(text)) return null;
    return BigInt(text);
  } catch (_) {
    return null;
  }
}

function normalizeAuditJson(value, ancestors = new Set(), arrayElement = false) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("invalid_learning_audit_event");
    return value;
  }
  if (value === undefined && !arrayElement) return undefined;
  if (!value || typeof value !== "object" || ancestors.has(value)) {
    throw new TypeError("invalid_learning_audit_event");
  }

  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if ((isArray && prototype !== Array.prototype) ||
      (!isArray && prototype !== Object.prototype && prototype !== null)) {
    throw new TypeError("invalid_learning_audit_event");
  }

  ancestors.add(value);
  try {
    if (isArray) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (key === "length") continue;
        const descriptor = descriptors[key];
        if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) {
          if (descriptor.enumerable) throw new TypeError("invalid_learning_audit_event");
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
          throw new TypeError("invalid_learning_audit_event");
        }
      }
      const result = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) {
          result.push(null);
        } else if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
          throw new TypeError("invalid_learning_audit_event");
        } else {
          const item = descriptor.value;
          result.push(item === undefined ? null : normalizeAuditJson(item, ancestors, true));
        }
      }
      return result;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable) continue;
      if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        throw new TypeError("invalid_learning_audit_event");
      }
      if (descriptor.value === undefined) continue;
      Object.defineProperty(result, key, {
        value: normalizeAuditJson(descriptor.value, ancestors, false),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function serializeAuditEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("invalid_learning_audit_event");
  }
  try {
    const value = normalizeAuditJson(event);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not_object");
    const serialized = stableJson(value);
    if (typeof serialized !== "string") throw new Error("not_json");
    return { serialized, value: JSON.parse(serialized) };
  } catch (_) {
    throw new TypeError("invalid_learning_audit_event");
  }
}

async function verifyAuditChain(pool) {
  const stateResult = await pool.query(
    "SELECT sequence, event_hash FROM marion_learning_audit_state WHERE singleton = TRUE"
  );
  if (stateResult.rowCount !== 1) return false;
  let sequence = 0n;
  let previousHash = "GENESIS";
  const rows = await pool.query(
    "SELECT sequence, previous_hash, event, event_hash FROM marion_learning_audit ORDER BY sequence ASC"
  );
  for (const row of rows.rows) {
    sequence += 1n;
    const expectedHash = auditHash(previousHash, sequence, row.event);
    if (parseAuditSequence(row.sequence) !== sequence || row.previous_hash !== previousHash || row.event_hash !== expectedHash) return false;
    previousHash = expectedHash;
  }
  const state = stateResult.rows[0];
  return parseAuditSequence(state.sequence) === sequence && state.event_hash === previousHash;
}

async function probeMarionLearningPostgres(pool) {
  if (!pool || typeof pool.query !== "function") return { ready: false, storage: "postgresql" };
  try {
    await pool.query("SELECT 1");
    const tableChecks = REQUIRED_SCHEMA_CHECKS
      .map(([key, table]) => `to_regclass('${table}') IS NOT NULL AS "${key}"`)
      .join(", ");
    const schemaResult = await pool.query(`SELECT ${tableChecks}`);
    const schema = schemaResult && schemaResult.rows && schemaResult.rows[0];
    if (!schema || !REQUIRED_SCHEMA_CHECKS.every(([key]) => schema[key] === true)) {
      return { ready: false, storage: "postgresql" };
    }
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
      await pool.query("INSERT INTO marion_learning_signals (signal) VALUES ($1::jsonb)", [JSON.stringify(checked.signal)]);
    }
  });

  const proposalStore = Object.freeze({
    async get(id) {
      const key = String(id || "");
      if (!ID_RE.test(key)) return null;
      const result = await pool.query("SELECT record FROM marion_learning_proposals WHERE proposal_id = $1", [key]);
      return result.rowCount ? result.rows[0].record : null;
    },
    async set(id, record) {
      const key = String(id || "");
      if (!ID_RE.test(key) || !record || typeof record !== "object" || Array.isArray(record)) {
        throw new TypeError("invalid_learning_proposal");
      }
      await pool.query(`INSERT INTO marion_learning_proposals (proposal_id, record)
        VALUES ($1, $2::jsonb) ON CONFLICT (proposal_id) DO UPDATE
        SET record = EXCLUDED.record, updated_at = NOW()`, [key, JSON.stringify(record)]);
    }
  });

  const manifestRegistryStore = Object.freeze({
    async get(key) {
      const result = await pool.query("SELECT record FROM marion_learning_manifest_registrations WHERE key_hash = $1", [manifestKeyHash(key)]);
      return result.rowCount ? result.rows[0].record : null;
    },
    async putIfAbsent(key, record) {
      if (!record || record.status !== "approved" || !Array.isArray(record.caseIds)) {
        throw new TypeError("invalid_manifest_registration");
      }
      const keyHash = manifestKeyHash(key);
      const result = await pool.query(`INSERT INTO marion_learning_manifest_registrations (key_hash, record)
        VALUES ($1, $2::jsonb) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash`, [keyHash, JSON.stringify(record)]);
      return result.rowCount === 1;
    },
    async getRevocation(key) {
      const result = await pool.query("SELECT record FROM marion_learning_manifest_revocations WHERE key_hash = $1", [manifestKeyHash(key)]);
      return result.rowCount ? result.rows[0].record : null;
    },
    async putRevocationIfAbsent(key, record) {
      if (!record || record.status !== "revoked") throw new TypeError("invalid_manifest_revocation");
      const keyHash = manifestKeyHash(key);
      const result = await pool.query(`INSERT INTO marion_learning_manifest_revocations (key_hash, record)
        VALUES ($1, $2::jsonb) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash`, [keyHash, JSON.stringify(record)]);
      return result.rowCount === 1;
    },
    async listApproved(scope) {
      const result = await pool.query(`SELECT record FROM marion_learning_manifest_registrations
        WHERE record->>'status' = 'approved' AND ($1::text IS NULL OR record->>'scope' = $1)
        ORDER BY created_at ASC`, [scope || null]);
      return result.rows.map(row => row.record);
    }
  });

  async function durableAuditAppend(event) {
    const normalizedEvent = serializeAuditEvent(event);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const stateResult = await client.query("SELECT sequence, event_hash FROM marion_learning_audit_state WHERE singleton = TRUE FOR UPDATE");
      if (stateResult.rowCount !== 1) throw new Error("learning_audit_state_missing");
      const state = stateResult.rows[0];
      const currentSequence = parseAuditSequence(state.sequence);
      const previousHash = state.event_hash;
      const maxSequence = 9223372036854775807n;
      if (currentSequence === null || currentSequence >= maxSequence || typeof previousHash !== "string") {
        throw new Error("learning_audit_state_invalid");
      }
      const tailResult = await client.query("SELECT sequence, event_hash FROM marion_learning_audit ORDER BY sequence DESC LIMIT 1");
      if (currentSequence === 0n) {
        if (previousHash !== "GENESIS" || tailResult.rowCount !== 0) throw new Error("learning_audit_state_mismatch");
      } else {
        const tail = tailResult.rows && tailResult.rows[0];
        if (tailResult.rowCount !== 1 || !tail || parseAuditSequence(tail.sequence) !== currentSequence || tail.event_hash !== previousHash) {
          throw new Error("learning_audit_state_mismatch");
        }
      }
      const sequence = currentSequence + 1n;
      const eventHash = auditHash(previousHash, sequence, normalizedEvent.value);
      await client.query("INSERT INTO marion_learning_audit (sequence, previous_hash, event, event_hash) VALUES ($1, $2, $3::jsonb, $4)",
        [sequence.toString(), previousHash, normalizedEvent.serialized, eventHash]);
      await client.query("UPDATE marion_learning_audit_state SET sequence = $1, event_hash = $2 WHERE singleton = TRUE", [sequence.toString(), eventHash]);
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
    initializeSchema: () => initializeMarionLearningPostgresSchema(pool),
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

module.exports = {
  VERSION,
  createMarionLearningPostgresAdapters,
  initializeMarionLearningPostgresSchema,
  probeMarionLearningPostgres
};

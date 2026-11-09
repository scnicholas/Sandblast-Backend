"use strict";

// Neon/PostgreSQL durable storage adapters for Marion Learning.
// The app owns the Pool lifecycle; this module never logs credentials or data.
const crypto = require("node:crypto");
const Policy = require("./MarionLearningPolicy");

const VERSION = "marion.learningPostgresAdapters/1.11-transaction-identity-and-revocation-hardening";
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function serializeSafeRecord(value, maxBytes = 65536, errorCode = "invalid_learning_record") {
  const checked = Policy.validateSafeRecord(value, maxBytes);
  if (!checked.ok) throw new TypeError(`${errorCode}:${checked.reason}`);
  return checked.serialized;
}

function validateStoredRecord(value, maxBytes = 65536) {
  const checked = Policy.validateSafeRecord(value, maxBytes);
  if (!checked.ok) throw new Error("stored_learning_record_invalid");
  return value;
}

// ManifestRegistry.registrationKey() is `${datasetId}@${version}`. The generic
// ID_RE deliberately excludes '@' and MUST NOT be used for registry keys.
// A strict, single-delimiter check preserves existing SHA-256 key hashes.
function parseRegistryKey(key) {
  if (typeof key !== "string") return null;
  const divider = key.indexOf("@");
  if (divider < 1 || divider !== key.lastIndexOf("@")) return null;
  const datasetId = key.slice(0, divider);
  const version = key.slice(divider + 1);
  return ID_RE.test(datasetId) && ID_RE.test(version)
    ? Object.freeze({ datasetId, version }) : null;
}

function validateRegistryKey(key) { return parseRegistryKey(key) !== null; }

// A transaction-scoped advisory lock serializes approval and revocation for
// the SAME manifest without modifying tables or requiring schema migration.
// PostgreSQL hashtextextended is stable within this deployment; the hash is
// used for lock identity only, never for durable record identity.
async function lockManifestKey(client, keyHash) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [keyHash]);
}

function confirmedInsert(result, field, expected) {
  return !!result && result.rowCount === 1 && Array.isArray(result.rows) &&
    result.rows.length === 1 && result.rows[0] && result.rows[0][field] === expected;
}

function validTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validApprovalAudit(id, record, event) {
  return !!event && event.type === "learning_proposal_submitted" &&
    event.proposalId === id && event.state === "awaiting_owner_approval" &&
    event.candidateVersion === record.candidateVersion;
}

function validDecisionAudit(id, decision, change, event) {
  return !!event && event.type === "learning_owner_decision" &&
    event.proposalId === id && event.decision === decision &&
    event.state === change.state && event.actorId === change.decidedBy &&
    event.approvalId === change.approvalId && validTimestamp(event.at) &&
    event.activationMode === "separate_release_pipeline" &&
    event.liveBehaviorChanged === false;
}


function requireMatchingRegistryRecord(key, record, expectedStatus) {
  const identity = parseRegistryKey(key);
  if (!identity || !record || typeof record !== "object" || Array.isArray(record) ||
      record.datasetId !== identity.datasetId || record.version !== identity.version ||
      record.status !== expectedStatus) {
    throw new Error("learning_registry_record_identity_mismatch");
  }
  return record;
}

// A row key must always describe the same proposal as its JSONB payload.
// Do not convert arbitrary objects/IDs to strings: that hides identity mismatches.
function assertProposalIdentity(id, record) {
  if (typeof id !== "string" || !ID_RE.test(id) || !record ||
      typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("learning_proposal_record_identity_mismatch");
  }
  let descriptor;
  try { descriptor = Object.getOwnPropertyDescriptor(record, "proposalId"); }
  catch (_) { throw new TypeError("learning_proposal_record_identity_mismatch"); }
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") || descriptor.value !== id)
    throw new TypeError("learning_proposal_record_identity_mismatch");
  return record;
}

function validateStoredReviewRecord(value) {
  validateStoredRecord(value);
  if (!isValidReviewRecord(value)) throw new Error("stored_learning_review_invalid");
  return value;
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
  const descriptors = Object.getOwnPropertyDescriptors(record);
  const keys = Reflect.ownKeys(descriptors);
  return Object.getPrototypeOf(record) === Object.prototype &&
    keys.every(key => typeof key === "string" && descriptors[key].enumerable === true &&
      Object.prototype.hasOwnProperty.call(descriptors[key], "value")) &&
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
      await pool.query(`CREATE TABLE IF NOT EXISTS public.marion_learning_signals (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        signal JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      // Created only by the explicit initializer, never by a normal health probe.
      // Existing duplicates must be reconciled before this index can be installed.
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS marion_learning_signals_signal_id_uq
        ON public.marion_learning_signals ((signal->>'signalId'))
        WHERE signal ? 'signalId'`);
      await pool.query(`CREATE TABLE IF NOT EXISTS public.marion_learning_proposals (
        proposal_id TEXT PRIMARY KEY,
        record JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS public.marion_learning_manifest_registrations (
        key_hash CHAR(64) PRIMARY KEY,
        record JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS public.marion_learning_manifest_revocations (
        key_hash CHAR(64) PRIMARY KEY,
        record JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS public.marion_learning_audit_state (
        singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
        sequence BIGINT NOT NULL,
        event_hash TEXT NOT NULL
      )`);
      await pool.query(`INSERT INTO public.marion_learning_audit_state (singleton, sequence, event_hash)
        VALUES (TRUE, 0, 'GENESIS') ON CONFLICT (singleton) DO NOTHING`);
      await pool.query(`CREATE TABLE IF NOT EXISTS public.marion_learning_audit (
        sequence BIGINT PRIMARY KEY,
        previous_hash TEXT NOT NULL,
        event JSONB NOT NULL,
        event_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS public.marion_learning_fixture_reviews (
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
    to_regclass('public.marion_learning_signals') IS NOT NULL AS signals_exists,
    to_regclass('public.marion_learning_proposals') IS NOT NULL AS proposals_exists,
    to_regclass('public.marion_learning_manifest_registrations') IS NOT NULL AS registrations_exists,
    to_regclass('public.marion_learning_manifest_revocations') IS NOT NULL AS revocations_exists,
    to_regclass('public.marion_learning_audit_state') IS NOT NULL AS audit_state_exists,
    to_regclass('public.marion_learning_audit') IS NOT NULL AS audit_exists,
    to_regclass('public.marion_learning_fixture_reviews') IS NOT NULL AS reviews_exists`);
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

// Read-only cryptographic verification, with no event payloads or credentials in output.
// Preserve the historical SHA-256 chain formula to avoid invalidating existing events.
async function verifyMarionLearningAuditIntegrity(pool) {
  const failed = reason => Object.freeze({ ok: false, reason, totalEvents: null, lastSequence: null });
  if (!pool || typeof pool.connect !== "function") return failed("postgres_pool_unavailable");
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    const stateResult = await client.query(
      "SELECT sequence, event_hash FROM public.marion_learning_audit_state WHERE singleton = TRUE"
    );
    if (!stateResult.rows || stateResult.rows.length !== 1) {
      await client.query("ROLLBACK"); transactionOpen = false;
      return failed("audit_state_missing_or_duplicate");
    }
    let sequence = 0n;
    let previousHash = "GENESIS";
    const pageSize = 500;
    let invalidReason = null;
    while (invalidReason === null) {
      const page = await client.query(
        "SELECT sequence, previous_hash, event, event_hash FROM public.marion_learning_audit WHERE sequence > $1 ORDER BY sequence ASC LIMIT $2",
        [sequence.toString(), pageSize]
      );
      const rows = page && Array.isArray(page.rows) ? page.rows : null;
      if (!rows) { invalidReason = "audit_page_unavailable"; break; }
      for (const row of rows) {
        const safeEvent = Policy.validateSafeRecord(row.event, 16384);
        if (!safeEvent.ok) { invalidReason = "audit_event_invalid"; break; }
        const nextSequence = sequence + 1n;
        const expectedHash = auditHash(previousHash, nextSequence, JSON.parse(safeEvent.serialized));
        if (BigInt(row.sequence) !== nextSequence) { invalidReason = "audit_sequence_gap_or_duplicate"; break; }
        if (row.previous_hash !== previousHash) { invalidReason = "audit_predecessor_mismatch"; break; }
        if (row.event_hash !== expectedHash) { invalidReason = "audit_event_hash_mismatch"; break; }
        sequence = nextSequence;
        previousHash = expectedHash;
      }
      if (rows.length < pageSize) break;
    }
    const state = stateResult.rows[0];
    if (!invalidReason && (BigInt(state.sequence) !== sequence || state.event_hash !== previousHash)) {
      invalidReason = "audit_state_pointer_mismatch";
    }
    await client.query("COMMIT"); transactionOpen = false;
    return Object.freeze({
      ok: invalidReason === null,
      reason: invalidReason || "audit_chain_verified",
      totalEvents: sequence.toString(),
      lastSequence: sequence.toString()
    });
  } catch (error) {
    if (transactionOpen) { try { await client.query("ROLLBACK"); } catch (_) {} }
    // Do not log event contents, SQL parameters, credentials, or internal error messages.
    throw error;
  } finally {
    client.release();
  }
}

async function verifyAuditChain(pool) {
  const result = await verifyMarionLearningAuditIntegrity(pool);
  return result.ok;
}

// Read-only, redacted diagnostic: the caller retains the historical readiness
// fields while receiving stage-specific evidence for Neon troubleshooting.
// Never include SQL text, pool configuration, credentials or raw error strings.
function classifyPostgresProbeError(error) {
  const code = error && typeof error.code === "string" ? error.code : "";
  if (["28P01", "28000"].includes(code)) return "postgres_authentication_failed";
  if (code === "3D000") return "postgres_database_missing";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) return "postgres_dns_failure";
  if (["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EPIPE", "57P01", "57P02", "57P03"].includes(code) || /^08[A-Z0-9]{3}$/.test(code))
    return "postgres_connection_failed";
  if (["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID", "CERT_HAS_EXPIRED"].includes(code))
    return "postgres_tls_verification_failed";
  if (code === "57014") return "postgres_query_timeout";
  if (code === "53300") return "postgres_connection_limit_reached";
  if (code === "42501") return "postgres_permission_denied";
  if (["42P01", "3F000", "42703"].includes(code)) return "postgres_schema_error";
  return "postgres_probe_failed";
}

async function probeMarionLearningPostgres(pool) {
  const state = {
    ready: false, coreReady: false, reviewStoreReady: false,
    storage: "postgresql", reason: "postgres_pool_unavailable",
    stage: "pool", databaseConnected: false, coreSchemaPresent: false,
    auditReady: false, auditReason: "not_checked", readOnly: true
  };
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") return state;
  try {
    state.stage = "connection";
    const ping = await pool.query("SELECT 1 AS marion_learning_probe");
    if (!ping || !Array.isArray(ping.rows) || ping.rows.length !== 1 ||
        Number(ping.rows[0].marion_learning_probe) !== 1) {
      state.reason = "postgres_ping_unconfirmed";
      return state;
    }
    state.databaseConnected = true;
    state.stage = "schema";
    const schema = await readSchemaPresence(pool);
    state.coreSchemaPresent = hasCoreSchema(schema);
    state.reviewStoreReady = !!schema && schema.reviews_exists === true;
    if (!state.coreSchemaPresent) {
      state.reason = schema ? "learning_schema_missing" : "learning_schema_probe_unconfirmed";
      return state;
    }
    state.stage = "audit";
    const audit = await verifyMarionLearningAuditIntegrity(pool);
    state.auditReady = audit.ok === true;
    state.auditReason = audit.reason;
    if (!state.auditReady) {
      state.reason = "learning_audit_chain_invalid";
      return state;
    }
    state.coreReady = true;
    if (!state.reviewStoreReady) {
      state.reason = "review_store_schema_missing";
      return state;
    }
    state.stage = "review_store";
    await pool.query("SELECT review_ref, record FROM public.marion_learning_fixture_reviews LIMIT 0");
    state.ready = true;
    state.reason = "evaluation_storage_ready";
    state.stage = "complete";
    return state;
  } catch (error) {
    state.reason = classifyPostgresProbeError(error);
    // A failure inspecting audit or review tables is not a connection failure.
    // Preserve established positive evidence rather than resetting readiness.
    return state;
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
      // Preserve only the trusted adapter's ISO timestamp; all other caller
      // metadata is filtered by Policy.validateSignal above.
      const recordedAt = signal && signal.recordedAt;
      if (recordedAt !== undefined &&
          (typeof recordedAt !== "string" ||
           !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(recordedAt) ||
           !Number.isFinite(Date.parse(recordedAt)) ||
           new Date(recordedAt).toISOString() !== recordedAt)) {
        throw new TypeError("invalid_learning_signal_recorded_at");
      }
      const storedSignal = { ...checked.signal, recordedAt: recordedAt || new Date().toISOString() };
      const inserted = await pool.query(
        "INSERT INTO public.marion_learning_signals (signal) VALUES ($1::jsonb) ON CONFLICT DO NOTHING RETURNING id, signal->>'signalId' AS signal_id",
        [JSON.stringify(storedSignal)]
      );
      const row = inserted && Array.isArray(inserted.rows) ? inserted.rows[0] : null;
      if (!inserted || inserted.rowCount !== 1 || !row || row.signal_id !== checked.signal.signalId || row.id == null) {
        throw new Error("learning_signal_persistence_unconfirmed");
      }
      return { ok: true, persisted: true, signalId: checked.signal.signalId };
    }
  });

  const proposalStore = Object.freeze({
    insertWithAudit: insertProposalWithAudit,
    decideWithAudit: decideProposalWithAudit,
    async get(id) {
      if (typeof id !== "string" || !ID_RE.test(id)) return null;
      const key = id;
      await assertSchema(pool);
      const result = await pool.query("SELECT record FROM public.marion_learning_proposals WHERE proposal_id = $1", [key]);
      if (!result || !Array.isArray(result.rows) || result.rowCount !== result.rows.length || result.rowCount > 1)
        throw new Error("learning_proposal_lookup_invalid");
      return result.rowCount === 1 ? assertProposalIdentity(key, validateStoredRecord(result.rows[0].record)) : null;
    },
    async set(id, record) {
      const key = id;
      if (typeof key !== "string" || !ID_RE.test(key) || !record || typeof record !== "object" || Array.isArray(record)) {
        throw new TypeError("invalid_learning_proposal");
      }
      assertProposalIdentity(key, record);
      const serialized = serializeSafeRecord(record, 65536, "invalid_learning_proposal");
      // Preserve draft-only compatibility, but never allow this generic method
      // to submit evaluations, grant approval, or alter an existing approved
      // proposal. All substantive transitions require the audited methods.
      if (record.state !== "draft" || record.validated === true ||
          record.liveBehaviorChanged === true || record.approved === true) {
        throw new Error("learning_proposal_audited_write_required");
      }
      await assertSchema(pool);
      const result = await pool.query(`INSERT INTO public.marion_learning_proposals (proposal_id, record)
        VALUES ($1, $2::jsonb) ON CONFLICT (proposal_id) DO UPDATE
        SET record = EXCLUDED.record, updated_at = NOW()
        WHERE public.marion_learning_proposals.record->>'state' = 'draft'
          AND public.marion_learning_proposals.record->>'validated' IS DISTINCT FROM 'true'
          AND public.marion_learning_proposals.record->>'liveBehaviorChanged' IS DISTINCT FROM 'true'
        RETURNING proposal_id`, [key, serialized]);
      if (!result || result.rowCount !== 1) {
        throw new Error("learning_proposal_audited_write_required");
      }
    }
  });

  // Atomic proposal state and audit persistence: all writes use the same
  // PostgreSQL transaction and a row lock. Never commit an unaudited approval.
  async function insertProposalWithAudit(id, record, auditEvent) {
    if (typeof id !== "string" || !ID_RE.test(id)) throw new TypeError("invalid_learning_proposal_id");
    assertProposalIdentity(id, record);
    if (record.state !== "awaiting_owner_approval" || record.validated !== true || record.liveBehaviorChanged !== false)
      throw new Error("learning_proposal_audited_write_required");
    const serialized = serializeSafeRecord(record, 65536, "invalid_learning_proposal");
    const safeAudit = JSON.parse(serializeSafeRecord(auditEvent, 16384, "invalid_learning_audit_event"));
    if (!validApprovalAudit(id, record, safeAudit)) throw new Error("learning_proposal_audit_identity_mismatch");
    await assertSchema(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        "INSERT INTO public.marion_learning_proposals (proposal_id, record) VALUES ($1, $2::jsonb) ON CONFLICT (proposal_id) DO NOTHING RETURNING proposal_id",
        [id, serialized]);
      if (inserted.rowCount !== 1) { await client.query("ROLLBACK"); return false; }
      await appendAuditWithClient(client, safeAudit);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    } finally { client.release(); }
  }

  async function decideProposalWithAudit(id, decision, change, auditEvent) {
    if (typeof id !== "string" || !ID_RE.test(id) || !["approve", "reject"].includes(decision)) throw new TypeError("invalid_learning_decision");
    await assertSchema(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT record FROM public.marion_learning_proposals WHERE proposal_id = $1 FOR UPDATE", [id]);
      if (current.rowCount !== 1) { await client.query("ROLLBACK"); return false; }
      const proposal = assertProposalIdentity(id, validateStoredRecord(current.rows[0].record));
      if (proposal.state !== "awaiting_owner_approval" || proposal.validated !== true || proposal.liveBehaviorChanged === true) {
        await client.query("ROLLBACK"); return false;
      }
      if (!change || typeof change !== "object" || Array.isArray(change) ||
          change.liveBehaviorChanged === true || change.validated === false) {
        await client.query("ROLLBACK"); return false;
      }
      const expectedState = decision === "approve" ? "approved_for_release_review" : "rejected_by_owner";
      // Only an Owner decision through ApprovalGate can move this record.
      // Ignore no caller-supplied authorization/activation mutations here.
      if (change.state !== expectedState ||
          Object.keys(change).some(key => !["state", "decidedAt", "decision", "approvalId", "decisionReason", "decidedBy"].includes(key)) ||
          change.decision !== decision) { await client.query("ROLLBACK"); return false; }
      const updated = Object.freeze({ ...proposal, ...change });
      if (updated.proposalId !== id || updated.liveBehaviorChanged !== false || updated.validated !== true ||
          updated.state !== expectedState) {
        await client.query("ROLLBACK"); return false;
      }
      const serialized = serializeSafeRecord(updated, 65536, "invalid_learning_proposal");
      const safeAudit = JSON.parse(serializeSafeRecord(auditEvent, 16384, "invalid_learning_audit_event"));
      if (!validDecisionAudit(id, decision, change, safeAudit)) throw new Error("learning_decision_audit_identity_mismatch");
      const changed = await client.query("UPDATE public.marion_learning_proposals SET record = $2::jsonb, updated_at = NOW() WHERE proposal_id = $1 RETURNING proposal_id", [id, serialized]);
      if (!confirmedInsert(changed, "proposal_id", id)) throw new Error("learning_proposal_update_unconfirmed");
      await appendAuditWithClient(client, safeAudit);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      throw error;
    } finally { client.release(); }
  }

  const manifestRegistryStore = Object.freeze({
    async get(key) {
      if (!validateRegistryKey(key)) return null;
      await assertSchema(pool);
      const result = await pool.query("SELECT record FROM public.marion_learning_manifest_registrations WHERE key_hash = $1", [hashKey(key)]);
      if (!result || !Array.isArray(result.rows) || result.rowCount !== result.rows.length || result.rowCount > 1) {
        throw new Error("learning_registry_lookup_invalid");
      }
      return result.rowCount === 1
        ? requireMatchingRegistryRecord(key, validateStoredRecord(result.rows[0].record), "approved") : null;
    },
    async putIfAbsent(key, record) {
      if (!validateRegistryKey(key) || !record || record.status !== "approved" || !Array.isArray(record.caseIds)) {
        throw new TypeError("invalid_manifest_registration");
      }
      requireMatchingRegistryRecord(key, record, "approved");
      const serialized = serializeSafeRecord(record, 65536, "invalid_manifest_registration");
      await assertSchema(pool);
      const keyHash = hashKey(key);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await lockManifestKey(client, keyHash);
        const revoked = await client.query("SELECT key_hash FROM public.marion_learning_manifest_revocations WHERE key_hash = $1", [keyHash]);
        if (!revoked || !Array.isArray(revoked.rows) || revoked.rowCount !== revoked.rows.length || revoked.rowCount > 1)
          throw new Error("learning_revocation_lookup_invalid");
        if (revoked.rowCount !== 0) { await client.query("ROLLBACK"); return false; }
        const result = await client.query(`INSERT INTO public.marion_learning_manifest_registrations (key_hash, record)
          VALUES ($1, $2::jsonb) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash`, [keyHash, serialized]);
        if (!confirmedInsert(result, "key_hash", keyHash)) { await client.query("ROLLBACK"); return false; }
        await appendAuditWithClient(client, {
          type: "learning_manifest_registration", action: "register_approved_manifest",
          keyHash, scope: record.scope || "unknown"
        });
        await client.query("COMMIT");
        return true;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        throw error;
      } finally { client.release(); }
    },
    async getRevocation(key) {
      if (!validateRegistryKey(key)) return null;
      await assertSchema(pool);
      const result = await pool.query("SELECT record FROM public.marion_learning_manifest_revocations WHERE key_hash = $1", [hashKey(key)]);
      if (!result || !Array.isArray(result.rows) || result.rowCount !== result.rows.length || result.rowCount > 1) {
        throw new Error("learning_registry_lookup_invalid");
      }
      return result.rowCount === 1
        ? requireMatchingRegistryRecord(key, validateStoredRecord(result.rows[0].record), "revoked") : null;
    },
    async putRevocationIfAbsent(key, record) {
      if (!validateRegistryKey(key) || !record || record.status !== "revoked") throw new TypeError("invalid_manifest_revocation");
      requireMatchingRegistryRecord(key, record, "revoked");
      const serialized = serializeSafeRecord(record, 65536, "invalid_manifest_revocation");
      await assertSchema(pool);
      const keyHash = hashKey(key);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await lockManifestKey(client, keyHash);
        const registration = await client.query("SELECT record FROM public.marion_learning_manifest_registrations WHERE key_hash = $1", [keyHash]);
        if (!registration || !Array.isArray(registration.rows) || registration.rowCount !== registration.rows.length || registration.rowCount > 1)
          throw new Error("learning_registration_lookup_invalid");
        if (registration.rowCount !== 1) { await client.query("ROLLBACK"); return false; }
        const approved = requireMatchingRegistryRecord(key, validateStoredRecord(registration.rows[0].record), "approved");
        if (record.manifestHash !== approved.manifestHash || record.fixtureSetHash !== approved.fixtureSetHash)
          throw new Error("learning_revocation_binding_mismatch");
        const result = await client.query(`INSERT INTO public.marion_learning_manifest_revocations (key_hash, record)
          VALUES ($1, $2::jsonb) ON CONFLICT (key_hash) DO NOTHING RETURNING key_hash`, [keyHash, serialized]);
        if (!confirmedInsert(result, "key_hash", keyHash)) { await client.query("ROLLBACK"); return false; }
        await appendAuditWithClient(client, {
          type: "learning_manifest_revocation", action: "revoke_manifest", keyHash
        });
        await client.query("COMMIT");
        return true;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        throw error;
      } finally { client.release(); }
    },
    async listApproved(scope) {
      if (scope !== undefined && scope !== null && !REVIEW_SCOPES.has(scope)) {
        throw new TypeError("invalid_manifest_scope");
      }
      await assertSchema(pool);
      const result = await pool.query(`SELECT r.key_hash, r.record FROM public.marion_learning_manifest_registrations r
        WHERE r.record->>'status' = 'approved'
          AND ($1::text IS NULL OR r.record->>'scope' = $1)
          AND NOT EXISTS (
            SELECT 1 FROM public.marion_learning_manifest_revocations v
            WHERE v.key_hash = r.key_hash
          )
        ORDER BY r.created_at ASC`, [scope || null]);
      if (!result || !Array.isArray(result.rows) || result.rowCount !== result.rows.length) {
        throw new Error("learning_registry_list_invalid");
      }
      return result.rows.map(row => {
        const record = validateStoredRecord(row.record);
        if (!record || !validateRegistryKey(`${record.datasetId}@${record.version}`) ||
            row.key_hash !== hashKey(`${record.datasetId}@${record.version}`)) {
          throw new Error("learning_registry_record_identity_mismatch");
        }
        return requireMatchingRegistryRecord(`${record.datasetId}@${record.version}`, record, "approved");
      });
    }
  });

  async function getReview(reviewRef) {
    const key = reviewRef;
    if (typeof key !== "string" || !ID_RE.test(key)) return null;
    await assertSchema(pool);
    const result = await pool.query(
      "SELECT record FROM public.marion_learning_fixture_reviews WHERE review_ref = $1",
      [key]
    );
    if (!result || !Array.isArray(result.rows) || result.rowCount !== result.rows.length || result.rowCount > 1)
      throw new Error("learning_review_lookup_invalid");
    if (result.rowCount === 0) return null;
    const review = validateStoredReviewRecord(result.rows[0].record);
    if (review.reviewRef !== key) throw new Error("learning_review_identity_mismatch");
    return review;
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
        const serialized = serializeSafeRecord(record, 65536, "invalid_signed_fixture_review");
        const inserted = await client.query(`INSERT INTO public.marion_learning_fixture_reviews (review_ref, record)
          VALUES ($1, $2::jsonb) ON CONFLICT (review_ref) DO NOTHING RETURNING review_ref`,
          [record.reviewRef, serialized]);
        if (!confirmedInsert(inserted, "review_ref", record.reviewRef)) {
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
    const stateResult = await client.query("SELECT sequence, event_hash FROM public.marion_learning_audit_state WHERE singleton = TRUE FOR UPDATE");
    if (!stateResult || !Array.isArray(stateResult.rows) || stateResult.rowCount !== 1 || stateResult.rows.length !== 1)
      throw new Error("learning_audit_state_missing");
    const state = stateResult.rows[0];
    const sequence = BigInt(state.sequence) + 1n;
    const previousHash = state.event_hash;
    if ((sequence === 1n && previousHash !== "GENESIS") ||
        (sequence > 1n && !HASH_RE.test(previousHash))) {
      throw new Error("learning_audit_state_invalid");
    }
    const safeEvent = JSON.parse(serializeSafeRecord(event, 16384, "invalid_learning_audit_event"));
    const eventHash = auditHash(previousHash, sequence, safeEvent);
    const audited = await client.query("INSERT INTO public.marion_learning_audit (sequence, previous_hash, event, event_hash) VALUES ($1, $2, $3::jsonb, $4)",
      [sequence.toString(), previousHash, JSON.stringify(safeEvent), eventHash]);
    if (!audited || audited.rowCount !== 1) throw new Error("learning_audit_append_unconfirmed");
    const advanced = await client.query("UPDATE public.marion_learning_audit_state SET sequence = $1, event_hash = $2 WHERE singleton = TRUE", [sequence.toString(), eventHash]);
    if (!advanced || advanced.rowCount !== 1) throw new Error("learning_audit_state_update_unconfirmed");
  }

  async function durableAuditAppend(event) {
    const serialized = serializeSafeRecord(event, 16384, "invalid_learning_audit_event");
    const safeEvent = JSON.parse(serialized);
    await assertSchema(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await appendAuditWithClient(client, safeEvent);
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
  probeMarionLearningPostgres,
  verifyMarionLearningAuditIntegrity
};

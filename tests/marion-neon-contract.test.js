"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Policy = require("../Data/marion/runtime/learning/MarionLearningPolicy");
const {
  createMarionLearningPostgresAdapters,
  probeMarionLearningPostgres
} = require("../Data/marion/runtime/learning/MarionLearningPostgresAdapters");

function validSignal(overrides = {}) {
  return {
    signalId: "signal-1",
    signalClass: "task_success",
    scope: "retrieval",
    sourceSubsystem: "contract-test",
    outcomeScore: 0.8,
    ...overrides
  };
}

function createMemoryPool({ schemaReady = true } = {}) {
  const state = {
    schemaReady,
    sequence: 0,
    eventHash: "GENESIS",
    auditRows: [],
    statements: []
  };
  const schemaRow = () => ({
    signals_exists: state.schemaReady,
    proposals_exists: state.schemaReady,
    registrations_exists: state.schemaReady,
    revocations_exists: state.schemaReady,
    audit_state_exists: state.schemaReady,
    audit_exists: state.schemaReady,
    reviews_exists: state.schemaReady
  });

  async function query(sql, params = []) {
    const text = String(sql);
    state.statements.push(text);
    if (/^SELECT 1\b/.test(text)) return { rows: [{ value: 1 }], rowCount: 1 };
    if (text.includes("to_regclass(")) return { rows: [schemaRow()], rowCount: 1 };
    if (text.includes("FROM marion_learning_audit_state")) {
      return { rows: [{ sequence: state.sequence, event_hash: state.eventHash }], rowCount: 1 };
    }
    if (text.includes("FROM marion_learning_audit ORDER BY")) {
      return { rows: state.auditRows.map(row => ({ ...row })), rowCount: state.auditRows.length };
    }
    if (text.includes("FROM marion_learning_fixture_reviews LIMIT 0")) return { rows: [], rowCount: 0 };
    if (/^(BEGIN|COMMIT|ROLLBACK)\b/.test(text)) return { rows: [], rowCount: 0 };
    throw new Error(`unexpected test query: ${text}`);
  }

  return {
    state,
    query,
    async connect() {
      return {
        async query(sql, params = []) {
          const text = String(sql);
          state.statements.push(text);
          if (/^(BEGIN|COMMIT|ROLLBACK)\b/.test(text)) return { rows: [], rowCount: 0 };
          if (text.includes("FROM marion_learning_audit_state")) {
            return { rows: [{ sequence: state.sequence, event_hash: state.eventHash }], rowCount: 1 };
          }
          if (text.startsWith("INSERT INTO marion_learning_audit ")) {
            const [sequence, previousHash, jsonEvent, eventHash] = params;
            state.auditRows.push({
              sequence: Number(sequence),
              previous_hash: previousHash,
              event: JSON.parse(jsonEvent),
              event_hash: eventHash
            });
            return { rows: [], rowCount: 1 };
          }
          if (text.startsWith("UPDATE marion_learning_audit_state ")) {
            state.sequence = Number(params[0]);
            state.eventHash = params[1];
            return { rows: [], rowCount: 1 };
          }
          throw new Error(`unexpected test client query: ${text}`);
        },
        release() {}
      };
    }
  };
}

test("learning scores reject coercible non-scores and retain numeric-string compatibility", () => {
  assert.equal(Policy.validateSignal(validSignal()).ok, true);
  assert.equal(Policy.validateSignal(validSignal({ outcomeScore: "0.4" })).signal.outcomeScore, 0.4);

  for (const outcomeScore of [null, "", "   ", true, false, -0.1, 1.1, "not-a-number"]) {
    assert.equal(Policy.validateSignal(validSignal({ outcomeScore })).ok, false, `accepted ${String(outcomeScore)}`);
  }
});

test("privacy screening fails closed on deeply nested or cyclic payloads", () => {
  let nested = { secret: "must-not-pass" };
  for (let index = 0; index < 6; index += 1) nested = { child: nested };
  assert.equal(Policy.validateSignal(validSignal({ extra: nested })).reason, "sensitive_field_present");

  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(Policy.validateSignal(validSignal({ extra: cyclic })).reason, "sensitive_field_present");
});

test("audit hashes match the JSON-normalized event that PostgreSQL stores", async () => {
  const pool = createMemoryPool();
  const adapters = createMarionLearningPostgresAdapters({
    pool,
    resolveVersion: async () => null,
    loadFixture: async () => null,
    scoreFixture: async () => null
  });
  const occurredAt = new Date("2026-10-10T00:00:00.000Z");
  await adapters.durableAuditAppend({
    type: "contract-test",
    omitted: undefined,
    values: [undefined, { z: 1, a: 2 }],
    occurredAt
  });

  assert.deepEqual(pool.state.auditRows[0].event, {
    type: "contract-test",
    values: [null, { z: 1, a: 2 }],
    occurredAt: "2026-10-10T00:00:00.000Z"
  });
  assert.deepEqual(await probeMarionLearningPostgres(pool), {
    ready: true,
    coreReady: true,
    reviewStoreReady: true,
    storage: "postgresql",
    reason: "evaluation_storage_ready"
  });
});

test("runtime readiness probing stays read-only when the learning schema is absent", async () => {
  const pool = createMemoryPool({ schemaReady: false });
  const result = await probeMarionLearningPostgres(pool);
  assert.equal(result.ready, false);
  assert.equal(result.reason, "learning_schema_missing");
  assert.equal(pool.state.statements.some(sql => /^\s*(CREATE|ALTER|DROP)\b/i.test(sql)), false);
});

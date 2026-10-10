'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const Policy = require('../Data/marion/runtime/learning/MarionLearningPolicy.js');
const { createMarionLearningPostgresAdapters, probeMarionLearningPostgres } = require('../Data/marion/runtime/learning/MarionLearningPostgresAdapters.js');

function fakePool() {
  const queries = [];
  const clientQueries = [];
  const stored = { proposal: null, review: null, auditRows: [] };
  const schema = {
    signals_exists: true,
    proposals_exists: true,
    registrations_exists: true,
    revocations_exists: true,
    audit_state_exists: true,
    audit_exists: true,
    reviews_exists: true,
  };
  const client = {
    async query(sql, params = []) {
      clientQueries.push({ sql, params });
      if (/SELECT sequence, event_hash FROM public\.marion_learning_audit_state/.test(sql)) {
        return { rowCount: 1, rows: [{ sequence: '0', event_hash: 'GENESIS' }] };
      }
      if (/SELECT sequence, previous_hash, event, event_hash FROM public\.marion_learning_audit/.test(sql)) {
        const rows = stored.auditRows.filter(row => BigInt(row.sequence) > BigInt(params[0])).slice(0, params[1]);
        return { rowCount: rows.length, rows };
      }
      if (/INSERT INTO public\.marion_learning_proposals/.test(sql)) {
        stored.proposal = JSON.parse(params[1]);
        return { rowCount: 1, rows: [] };
      }
      if (/SELECT record FROM public\.marion_learning_proposals/.test(sql)) {
        return { rowCount: stored.proposal ? 1 : 0, rows: stored.proposal ? [{ record: stored.proposal }] : [] };
      }
      if (/SELECT record FROM public\.marion_learning_fixture_reviews/.test(sql)) {
        return { rowCount: stored.review ? 1 : 0, rows: stored.review ? [{ record: stored.review }] : [] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  return {
    queries,
    clientQueries,
    pool: {
      async query(sql, params = []) {
        queries.push({ sql, params });
        if (/to_regclass/.test(sql)) return { rowCount: 1, rows: [schema] };
        if (/INSERT INTO public\.marion_learning_proposals/.test(sql)) {
          stored.proposal = JSON.parse(params[1]);
          return { rowCount: 1, rows: [] };
        }
        if (/SELECT record FROM public\.marion_learning_proposals/.test(sql)) {
          return { rowCount: stored.proposal ? 1 : 0, rows: stored.proposal ? [{ record: stored.proposal }] : [] };
        }
        if (/SELECT record FROM public\.marion_learning_fixture_reviews/.test(sql)) {
          return { rowCount: stored.review ? 1 : 0, rows: stored.review ? [{ record: stored.review }] : [] };
        }
        return { rowCount: 1, rows: [] };
      },
      async connect() { return client; },
    },
    stored,
  };
}

function adaptersFor(pool) {
  return createMarionLearningPostgresAdapters({
    pool,
    resolveVersion: async () => null,
    loadFixture: async () => null,
    scoreFixture: async () => null,
  });
}

test('learning policy rejects sensitive aliases, excessive depth, and coerced scores', () => {
  const valid = {
    signalId: 'signal-1', signalClass: 'task_success', scope: 'retrieval',
    sourceSubsystem: 'retrieval', outcomeScore: 0.8,
  };
  assert.equal(Policy.validateSignal(valid).ok, true);
  assert.equal(Policy.validateSignal({ ...valid, outcomeScore: '0.8' }).ok, false);
  assert.equal(Policy.validateSignal({ ...valid, metadata: { raw_user_message: 'private text' } }).reason, 'sensitive_field_present');
  const deep = {};
  let nested = deep;
  for (let i = 0; i < 12; i += 1) {
    nested.child = i === 11 ? 'value' : {};
    nested = nested.child;
  }
  assert.equal(Policy.validateSignal({ ...valid, metadata: deep }).reason, 'sensitive_field_present');
});

test('runtime stores reject prompt-shaped records before reaching PostgreSQL', async () => {
  const fake = fakePool();
  const adapters = adaptersFor(fake.pool);
  await assert.rejects(
    adapters.proposalStore.set('proposal-1', { status: 'pending', raw_user_message: 'do not persist' }),
    /sensitive_field_present/,
  );
  await assert.rejects(
    adapters.durableAuditAppend({ event: 'test', nested: { prompt: 'do not persist' } }),
    /sensitive_field_present/,
  );
  assert.equal(fake.queries.length, 0);
  assert.equal(fake.clientQueries.length, 0);
});

test('safe records use public-qualified SQL and the audit verifier reads bounded pages in a snapshot', async () => {
  const fake = fakePool();
  const adapters = adaptersFor(fake.pool);
  await adapters.proposalStore.set('proposal-2', { status: 'pending', scope: 'retrieval' });
  const proposal = await adapters.proposalStore.get('proposal-2');
  assert.deepEqual(proposal, { status: 'pending', scope: 'retrieval' });

  const health = await probeMarionLearningPostgres(fake.pool);
  assert.equal(health.ready, true, health.reason);
  assert.ok(fake.queries.some(row => row.sql.includes("to_regclass('public.marion_learning_signals')")));
  assert.ok(fake.queries.every(row => !/\b(?:FROM|INTO|UPDATE|TABLE) marion_learning_/.test(row.sql)));
  assert.ok(fake.clientQueries.some(row => /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/.test(row.sql)));
  assert.ok(fake.clientQueries.some(row => /LIMIT \$2/.test(row.sql)));
  assert.ok(fake.clientQueries.every(row => !/\b(?:FROM|INTO|UPDATE|TABLE) marion_learning_/.test(row.sql)));
});

test('durable audit append serializes safe events with a monotonic bigint sequence', async () => {
  const fake = fakePool();
  const adapters = adaptersFor(fake.pool);
  await adapters.durableAuditAppend({ type: 'owner_review', status: 'approved' });
  const insert = fake.clientQueries.find(row => /INSERT INTO public\.marion_learning_audit /.test(row.sql));
  assert.ok(insert);
  assert.equal(insert.params[0], '1');
  assert.equal(JSON.parse(insert.params[2]).type, 'owner_review');
  assert.ok(fake.clientQueries.some(row => row.sql === 'COMMIT'));
});

test('manifest registry and persisted review reads fail closed on invalid keys, scopes, and records', async () => {
  const fake = fakePool();
  const adapters = adaptersFor(fake.pool);

  assert.equal(await adapters.manifestRegistryStore.get('../bad'), null);
  assert.equal(await adapters.manifestRegistryStore.getRevocation('bad key'), null);
  await assert.rejects(
    adapters.manifestRegistryStore.putIfAbsent('../bad', { status: 'approved', caseIds: [] }),
    /invalid_manifest_registration/,
  );
  await assert.rejects(
    adapters.manifestRegistryStore.putRevocationIfAbsent('manifest-1', { status: 'revoked', prompt: 'private' }),
    /invalid_manifest_revocation/,
  );
  await assert.rejects(adapters.manifestRegistryStore.listApproved('system_prompt'), /invalid_manifest_scope/);
  assert.equal(fake.queries.length, 0);

  fake.stored.review = { approved: true, ownerConsent: true, scope: 'retrieval' };
  await assert.rejects(adapters.reviewStore.get('review-1'), /stored_learning_review_invalid/);
});

test('audit-chain readiness fails closed on an oversized or sensitive persisted event', async () => {
  const fake = fakePool();
  fake.stored.auditRows = [{
    sequence: '1',
    previous_hash: 'GENESIS',
    event: { type: 'bad_event', prompt: 'must not be read as a valid audit event' },
    event_hash: '0'.repeat(64),
  }];
  const health = await probeMarionLearningPostgres(fake.pool);
  assert.equal(health.ready, false);
  assert.equal(health.reason, 'learning_audit_chain_invalid');
  assert.ok(fake.clientQueries.some(row => row.sql === 'ROLLBACK'));
});

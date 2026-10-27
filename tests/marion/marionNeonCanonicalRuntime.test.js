'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarionNeonCanonicalRuntime } = require('../../Data/marion/runtime/marionNeonCanonicalRuntime');

function mock(overrides = {}) {
  const calls = [];
  const deps = {
    authorize: async () => { calls.push('authorize'); return { authorized: true }; },
    loadContext: async () => { calls.push('loadContext'); return { entries: [] }; },
    invokeGateway: async () => { calls.push('invokeGateway'); return { output: 'model response' }; },
    compose: async () => { calls.push('compose'); return 'composed response'; },
    validate: async ({ composed }) => { calls.push('validate'); return { valid: true, response: composed }; },
    writeAudit: async () => { calls.push('writeAudit'); },
    ...overrides,
  };
  return { calls, runtime: createMarionNeonCanonicalRuntime(deps) };
}

test('canonical pipeline produces one validated response', async () => {
  const { calls, runtime } = mock();
  assert.equal(await runtime.execute({ message: 'test' }), 'composed response');
  assert.deepEqual(calls, ['authorize','loadContext','invokeGateway','compose','validate','writeAudit']);
});

test('authorization failure prevents all downstream execution', async () => {
  const { calls, runtime } = mock({ authorize: async () => { calls.push('authorize'); return { authorized: false }; } });
  await assert.rejects(runtime.execute({ message: 'test' }), { code: 'MARION_UNAUTHORIZED' });
  assert.deepEqual(calls, ['authorize']);
});

test('invalid response never escapes', async () => {
  const { calls, runtime } = mock({ validate: async () => { calls.push('validate'); return { valid: false }; } });
  await assert.rejects(runtime.execute({ message: 'test' }), { code: 'MARION_VALIDATION_FAILED' });
  assert.equal(calls.includes('writeAudit'), false);
});

test('audit failure does not masquerade as successful execution', async () => {
  const { runtime } = mock({ writeAudit: async () => { throw new Error('audit unavailable'); } });
  await assert.rejects(runtime.execute({ message: 'test' }), /audit unavailable/);
});

test('missing mandatory safety contract is rejected', () => {
  assert.throws(() => createMarionNeonCanonicalRuntime({}), /Missing required adapter/);
});

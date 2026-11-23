'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { authorityDiagnostics, builderSnapshot, safeCodes } = require('./marion-wrap-diagnostic.cjs');

test('reads actual nested bridge fallback diagnostics', () => {
  const result = authorityDiagnostics({ diagnostics: {
    reason: 'final_envelope_invalid', localFinalFallback: true,
    loopGuard: {
      finalBoundaryReasons: ['current_turn_not_bound', 'authority_signature_missing'],
      finalBuilderAuthoritySnapshot: { ok: false, final: false, marionFinal: false, signaturePresent: false, contractReasons: ['reply_missing'] }
    }
  }});
  assert.equal(result.bridgeReason, 'final_envelope_invalid');
  assert.equal(result.fallbackDetected, true);
  assert.deepEqual(result.boundaryReasons, ['current_turn_not_bound', 'authority_signature_missing']);
  assert.equal(result.builder.present, true);
  assert.deepEqual(result.builder.contractReasons, ['reply_missing']);
});

test('missing builder data is not represented as successful validation', () => {
  const result = authorityDiagnostics({ ok: false, diagnostics: {} });
  assert.equal(result.builder.present, false);
  assert.equal(result.boundaryReasonsPresent, false);
  assert.equal(result.diagnosticLocation, 'not_returned');
});

test('rejects reply content, secrets and invalid reason strings', () => {
  const result = authorityDiagnostics({ diagnostics: { loopGuard: {
    finalBoundaryReasons: ['VALID_CODE', 'token=secret', 'A'.repeat(200), { secret: true }],
    finalBuilderAuthoritySnapshot: { signature: 'PRIVATE', reply: 'PRIVATE TEXT', contractReasons: ['ok', 'private reply here'] }
  } } });
  const serialized = JSON.stringify(result);
  assert.deepEqual(result.boundaryReasons, ['VALID_CODE']);
  assert.equal(serialized.includes('PRIVATE'), false);
  assert.equal(serialized.includes('secret'), false);
  assert.equal(serialized.includes('private reply'), false);
});

test('supports alternate diagnostic placement and explicit false fields', () => {
  const r = authorityDiagnostics({ diagnostics: { finalBoundaryReasons: ['completion_incomplete'], finalBuilderSnapshot: { completionComplete: false, trustAllowsEmit: false } } });
  assert.deepEqual(r.boundaryReasons, ['completion_incomplete']);
  assert.equal(r.builder.completionComplete, false);
  assert.equal(r.builder.trustAllowsEmit, false);
});

'use strict';

const assert = require('assert');
const G = require('../../Data/marion/runtime/ecosystem/MarionChronicleIntegrityGovernor');

const supported = G.evaluate({
  claimId: 'claim-supported',
  statement: 'A documented business occupied the address during the specified period.',
  validFrom: '1952-01-01',
  validTo: '1956-12-31',
  confidence: 'A',
  reconstructionEligible: true,
  sources: [{
    sourceId: 'archive-1',
    title: 'City directory',
    institution: 'City Archives',
    evidenceClass: 'primary'
  }]
}, {
  requestedDate: '1954-06-01'
});

assert.equal(supported.ok, true);
assert.equal(supported.decision, 'allow');
assert.equal(supported.reconstructionEligible, true);

const before = G.evaluate({
  claimId: 'claim-before',
  statement: 'Building exists.',
  validFrom: '1955-01-01',
  validTo: '1960-12-31',
  confidence: 'A',
  reconstructionEligible: true,
  sources: [{
    sourceId: 'archive-2',
    title: 'Building permit',
    evidenceClass: 'primary'
  }]
}, {
  requestedDate: '1954-01-01'
});

assert.equal(before.decision, 'block');
assert.ok(before.reasons.includes('before_valid_from'));

const theory = G.evaluate({
  claimId: 'claim-theory',
  statement: 'A theory source proves what stood on this street.',
  confidence: 'A',
  reconstructionEligible: true,
  sources: [{
    sourceId: 'theory-1',
    title: 'Time travel theory',
    evidenceClass: 'theoretical'
  }]
});

assert.equal(theory.decision, 'block');
assert.ok(theory.reasons.includes('theory_cannot_prove_historical_detail'));

const unknown = G.evaluate({
  claimId: 'claim-unknown',
  statement: 'Exact storefront colour is unknown.',
  confidence: 'UNKNOWN',
  unknown: true,
  sources: []
});

assert.equal(unknown.ok, true);
assert.equal(unknown.decision, 'unknown');
assert.equal(unknown.reconstructionEligible, false);

console.log('PASS marion_ecosystem_phase5_chronicle_integrity_test');

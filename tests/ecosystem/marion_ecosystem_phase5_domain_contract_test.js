'use strict';

const assert = require('assert');
const C = require('../../Data/marion/runtime/ecosystem/MarionDomainIntelligenceContract');

const chronicle = C.normalize({
  requestId: 'r1',
  traceId: 't1',
  source: 'marion',
  domain: 'chronicle',
  intent: 'historical reconstruction',
  query: 'What is supported at this Toronto address in 1954?'
});

assert.equal(chronicle.domain, 'chronicle');
assert.equal(chronicle.intent, 'historical_reconstruction');
assert.equal(C.validate(chronicle).ok, true);

const guardians = C.normalize({
  requestId: 'r2',
  traceId: 't2',
  source: 'marion',
  domain: 'guardians',
  intent: 'strategy review',
  query: 'Review this strategic scenario.'
});

assert.equal(guardians.domain, 'project-guardians');
assert.equal(guardians.intent, 'strategy_review');
assert.equal(C.validate(guardians).ok, true);

const direct = C.normalize({
  requestId: 'r3',
  traceId: 't3',
  source: 'nyx',
  domain: 'chronicle',
  query: 'Bypass Marion'
});

assert.equal(C.validate(direct).ok, false);

console.log('PASS marion_ecosystem_phase5_domain_contract_test');

'use strict';

const assert = require('assert');

const Phase2 = require('../../Data/marion/runtime/ecosystem/MarionEcosystemComponentBootstrap');
const Phase3 = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase3Bootstrap');
const Phase4 = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase4Bootstrap');
const Phase5 = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase5Bootstrap');
const Health = require('../../Data/marion/runtime/ecosystem/MarionEcosystemBaselineHealth');

Phase2.bootstrap();
Phase3.bootstrap();
Phase4.bootstrap();
Phase5.bootstrap();

const health = Health.getHealth();

assert.equal(health.ok, true);
assert.equal(health.baselineVersion, '1.0.0');
assert.equal(health.status, 'STATIC_CERTIFIED_LIVE_PENDING');
assert.equal(health.certification.staticCertified, true);
assert.equal(health.certification.liveCertified, false);
assert.equal(health.certification.productionFreezeClaimAllowed, false);
assert.equal(health.components.length, 10);
assert.equal(health.components.every(item => item.registered), true);

console.log('PASS marion_ecosystem_baseline_health_test');

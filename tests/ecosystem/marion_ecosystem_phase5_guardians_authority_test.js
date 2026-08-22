'use strict';

const assert = require('assert');
const P = require('../../Data/marion/runtime/ecosystem/MarionGuardiansAuthorityPolicy');

const aster = P.authorizeReview('aster', 'signal_analysis');
assert.equal(aster.ok, true);
assert.equal(aster.guardian.finalAuthority, false);

const thalon = P.authorizeReview('talon', 'strategy_review');
assert.equal(thalon.ok, true);
assert.equal(thalon.guardian.id, 'thalon');
assert.equal(thalon.guardian.finalAuthority, false);

const controlled = P.enforceOutput('thalon', {
  summary: 'Advisory strategic review'
});

assert.equal(controlled.advisoryOnly, true);
assert.equal(controlled.requiresMarionReview, true);
assert.equal(controlled.mayOverrideMarion, false);
assert.equal(controlled.automaticExecutionAllowed, false);
assert.equal(controlled.physicalActionControlAllowed, false);
assert.equal(controlled.punitiveUseAllowed, false);
assert.equal(controlled.coerciveUseAllowed, false);

const marion = P.getGuardian('marion');
assert.equal(marion.finalAuthority, true);

console.log('PASS marion_ecosystem_phase5_guardians_authority_test');

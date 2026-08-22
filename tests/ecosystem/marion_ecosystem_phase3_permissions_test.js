'use strict';

const assert = require('assert');
const P = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPermissions');
const B = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase3Bootstrap');

B.bootstrap();

assert.equal(P.authorize('crm', 'read', 'crm.leads').ok, true);
assert.equal(P.authorize('crm', 'request', 'marion.analysis').ok, true);
assert.equal(P.authorize('crm', 'request', 'marion.recommendation').ok, true);
assert.equal(P.authorize('crm', 'write', 'crm.telemetry').ok, true);

assert.equal(P.authorize('crm', 'write', 'crm.leads').ok, false);
assert.equal(P.authorize('crm', 'execute', 'crm.send_message').ok, false);
assert.equal(P.authorize('crm', 'execute', 'crm.change_stage').ok, false);

console.log('PASS marion_ecosystem_phase3_permissions_test');

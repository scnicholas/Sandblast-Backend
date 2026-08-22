'use strict';

const assert = require('assert');

const P = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPermissions');
const B = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase5Bootstrap');

B.bootstrap();

assert.equal(P.authorize('chronicle', 'read', 'chronicle.sources').ok, true);
assert.equal(P.authorize('chronicle', 'write', 'chronicle.state').ok, true);
assert.equal(P.authorize('chronicle', 'execute', 'chronicle.publish_reconstruction').ok, false);

assert.equal(P.authorize('project-guardians', 'read', 'project-guardians.state').ok, true);
assert.equal(P.authorize('project-guardians', 'execute', 'guardians.physical_action').ok, false);

console.log('PASS marion_ecosystem_phase5_permissions_test');

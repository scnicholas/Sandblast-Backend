'use strict';

const assert = require('assert');

const Permissions = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPermissions');
const Phase2 = require('../../Data/marion/runtime/ecosystem/MarionEcosystemComponentBootstrap');
const Phase3 = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase3Bootstrap');
const Phase4 = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase4Bootstrap');
const Phase5 = require('../../Data/marion/runtime/ecosystem/MarionEcosystemPhase5Bootstrap');

Phase2.bootstrap();
Phase3.bootstrap();
Phase4.bootstrap();
Phase5.bootstrap();

const denied = [
  ['nyx', 'execute', 'marion.command'],
  ['lingosentinel', 'execute', 'marion.command'],
  ['crm', 'execute', 'crm.send_message'],
  ['crm', 'write', 'crm.leads'],
  ['sandblast-radio', 'execute', 'sandblast-radio.playback'],
  ['sandblast-tv', 'execute', 'sandblast-tv.playback'],
  ['chronicle', 'execute', 'chronicle.publish_reconstruction'],
  ['project-guardians', 'execute', 'guardians.physical_action'],
  ['marion', 'execute', 'system.command']
];

for (const [component, action, resource] of denied) {
  const result = Permissions.authorize(component, action, resource);
  assert.equal(
    result.ok,
    false,
    `${component} unexpectedly allowed ${action}:${resource}`
  );
}

assert.equal(
  Permissions.authorize('nyx', 'request', 'marion.reasoning').ok,
  true
);

assert.equal(
  Permissions.authorize('chronicle', 'request', 'marion.reasoning').ok,
  true
);

console.log('PASS marion_ecosystem_baseline_permissions_test');

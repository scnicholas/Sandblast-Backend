'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const names = [
  'marion_ecosystem_phase5_domain_contract_test.js',
  'marion_ecosystem_phase5_chronicle_integrity_test.js',
  'marion_ecosystem_phase5_guardians_authority_test.js',
  'marion_ecosystem_phase5_permissions_test.js',
  'marion_ecosystem_phase5_routing_test.js'
];

for (const name of names) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, name)],
    {
      stdio: 'inherit',
      env: process.env
    }
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('PASS MARION ECOSYSTEM PHASE 5 DOMAIN INTELLIGENCE STATIC CERTIFICATION');

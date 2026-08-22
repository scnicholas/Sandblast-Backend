'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const tests = [
  'marion_ecosystem_phase3_crm_normalizer_test.js',
  'marion_ecosystem_phase3_crm_scoring_test.js',
  'marion_ecosystem_phase3_permissions_test.js',
  'marion_ecosystem_phase3_gohighlevel_read_test.js',
  'marion_ecosystem_phase3_crm_integration_test.js'
];

for (const name of tests) {
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

console.log('PASS MARION ECOSYSTEM PHASE 3 CRM STATIC CERTIFICATION');

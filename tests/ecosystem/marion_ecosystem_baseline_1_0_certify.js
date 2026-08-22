'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      walk(full, out);
    } else if (full.endsWith('.js')) {
      out.push(full);
    }
  }

  return out;
}

const jsFiles = [
  ...walk(path.join(root, 'Data/marion/runtime/ecosystem')),
  ...walk(path.join(root, 'public/ecosystem')),
  ...walk(path.join(root, 'tests/ecosystem'))
];

for (const file of jsFiles) {
  const result = spawnSync(
    process.execPath,
    ['--check', file],
    {
      stdio: 'pipe',
      encoding: 'utf8'
    }
  );

  if (result.status !== 0) {
    console.error(`SYNTAX FAIL ${file}`);
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`PASS baseline syntax certification (${jsFiles.length} JavaScript files)`);

const certs = [
  'marion_ecosystem_baseline_foundation_test.js',
  'marion_ecosystem_phase2_certify.js',
  'marion_ecosystem_phase3_certify.js',
  'marion_ecosystem_phase4_certify.js',
  'marion_ecosystem_phase5_certify.js',
  'marion_ecosystem_baseline_structure_test.js',
  'marion_ecosystem_baseline_permissions_test.js',
  'marion_ecosystem_baseline_health_test.js',
  'marion_ecosystem_baseline_hash_verify.js'
];

for (const name of certs) {
  const file = path.join(__dirname, name);

  const result = spawnSync(
    process.execPath,
    [file],
    {
      stdio: 'inherit',
      env: process.env
    }
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('PASS SANDBLAST ECOSYSTEM BASELINE 1.0 STATIC FREEZE CERTIFICATION');
console.log('STATUS STATIC_CERTIFIED_LIVE_PENDING');

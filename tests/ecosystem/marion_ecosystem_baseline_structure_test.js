'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const required = [
  'Data/marion/runtime/ecosystem/MarionEcosystemContract.js',
  'Data/marion/runtime/ecosystem/MarionEcosystemGateway.js',
  'Data/marion/runtime/ecosystem/MarionEcosystemPhase2Route.js',
  'Data/marion/runtime/ecosystem/MarionEcosystemPhase3Route.js',
  'Data/marion/runtime/ecosystem/MarionEcosystemPhase4Route.js',
  'Data/marion/runtime/ecosystem/MarionEcosystemPhase5Route.js',
  'Data/marion/runtime/ecosystem/MarionEcosystemBaselineManifest.js',
  'Data/marion/runtime/ecosystem/MarionEcosystemBaselineHealth.js',
  'Data/marion/runtime/ecosystem/MarionEcosystemBaselineRoute.js',
  'public/ecosystem/marion-nyx-ecosystem-client.js',
  'public/ecosystem/marion-lingosentinel-ecosystem-client.js',
  'public/ecosystem/marion-media-telemetry-client.js'
];

for (const rel of required) {
  assert.equal(
    fs.existsSync(path.join(root, rel)),
    true,
    `required file missing: ${rel}`
  );
}

const files = fs.readdirSync(
  path.join(root, 'Data/marion/runtime/ecosystem')
);

assert.ok(files.length >= 48, `unexpected ecosystem runtime count: ${files.length}`);

console.log('PASS marion_ecosystem_baseline_structure_test');

'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const tests = ['layers_1_7_regression_test.js', 'layers_5_7_functional_validation_test.js', 'layers_5_7_public_client_test.js', 'layers_5_7_route_contract_test.js'];
let ok = true;
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) ok = false;
}
process.exit(ok ? 0 : 1);

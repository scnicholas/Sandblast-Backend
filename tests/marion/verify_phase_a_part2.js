"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const tests = [
  "layers_21_24_remaining_runtime_integration_test.js",
  "private_runtime_nuance_integration_test.js",
  "completion_layers_18_24_cohesion_test.js",
  "final_envelope_nuance_redaction_test.js"
];

for (const test of tests) {
  const full = path.join(__dirname, test);
  const result = spawnSync(process.execPath, [full], {
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    console.error(`FAILED: ${test}`);
    process.exit(result.status || 1);
  }

  console.log(`PASS: ${test}`);
}

console.log(JSON.stringify({
  ok: true,
  suite: "Marion Phase A Layers 21-24 Critical Integration Part 2",
  testsPassed: tests.length
}, null, 2));

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const TESTS = Object.freeze([
  "layers_21_24_remaining_runtime_integration_test.js",
  "private_runtime_nuance_integration_test.js",
  "completion_layers_18_24_cohesion_test.js",
  "final_envelope_nuance_redaction_test.js"
]);
const TIMEOUT_MS = 90000;

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: BACKEND_ROOT,
    env: { ...process.env, NODE_OPTIONS: "" },
    encoding: "utf8",
    windowsHide: true,
    timeout: TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    console.error(`FAILED: ${label}: ${result.error.message || result.error}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`FAILED: ${label}`);
    process.exit(Number.isInteger(result.status) ? result.status : 1);
  }
}

for (const name of TESTS) {
  const full = path.join(__dirname, name);

  if (!fs.existsSync(full)) {
    console.error(`FAILED: required test is missing: ${full}`);
    process.exit(1);
  }

  runNode(["--check", full], `syntax ${name}`);
  runNode([full], name);
  console.log(`PASS: ${name}`);
}

console.log(JSON.stringify({
  "ok": true,
  "suite": "Marion Phase A Layers 21-24 Critical Integration Part 2",
  "testsPassed": 4,
  "pathPolicy": "tests/marion canonical"
}, null, 2));

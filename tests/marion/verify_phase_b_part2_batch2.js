"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const TESTS = Object.freeze([
  "phase_b_state_spine_integration_test.js",
  "phase_b_chat_engine_transport_test.js",
  "phase_b_index_manifest_package_contract_test.js"
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
  "suite": "Marion Phase B Part 2 Batch 2",
  "testsPassed": 3,
  "hardStopLayer": 26,
  "globalCertifiedHardStopLayer": 28
}, null, 2));

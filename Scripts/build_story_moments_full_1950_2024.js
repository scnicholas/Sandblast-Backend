"use strict";

/**
 * One-command end-to-end: 1950–2024 story coverage.
 * Assumes 1950–1959 story moments already exist.
 * Builds 1960–2024 via the year-end Hot 100 builder.
 *
 * Usage:
 *   node Scripts/build_story_moments_full_1950_2024.js
 */

const { execSync } = require("child_process");

function run(cmd) {
  console.log("\n==>", cmd);
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  run("node Scripts/build_story_moments_yearend_hot100.js 1960 2024");
  run("node Scripts/validate_story_moments_1950_1989.js");
  // Optional: add a second validator for 1990–2024 (I can provide it), or keep a single broad validator.
  console.log("\nDONE: story moments built for 1960–2024. Baseline 1950–1959 already present.");
}

main();

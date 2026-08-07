"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  abs,
  readJson,
  npmRunReferences
} = require("./_round6_common.js");

const PRIOR_ROUNDS = Object.freeze([
  "tests/marion/layers_1_28/round1/run_round1_certification.js",
  "tests/marion/layers_1_28/round2/run_round2_certification.js",
  "tests/marion/layers_1_28/round3/run_round3_certification.js",
  "tests/marion/layers_1_28/round4/run_round4_certification.js",
  "tests/marion/layers_1_28/round5/run_round5_certification.js"
]);

test(
  "Round 6.1 prior Round 1 through Round 5 master runners remain present",
  () => {
    const missing =
      PRIOR_ROUNDS.filter(
        (relativePath) =>
          !fs.existsSync(
            abs(relativePath)
          )
      );

    assert.deepStrictEqual(
      missing,
      [],
      `Prior certification runners are missing: ${missing.join(", ")}`
    );
  }
);

test(
  "Round 6.1 package Round 6 pathway and inherited verify chain are exact",
  () => {
    const pkg =
      readJson("package.json");

    assert.equal(
      pkg.type,
      "commonjs",
      "CommonJS architecture changed."
    );

    assert.equal(
      pkg.scripts["test:marion-round5"],
      "node tests/marion/layers_1_28/round5/run_round5_certification.js",
      "Round 5 pathway drifted."
    );

    assert.equal(
      pkg.scripts["test:marion-round6"],
      "node tests/marion/layers_1_28/round6/run_round6_certification.js",
      "Round 6 pathway drifted."
    );

    assert.deepEqual(
      npmRunReferences(
        pkg.scripts["verify:marion-round6"]
      ),
      [
        "verify:marion-round5",
        "test:marion-round6"
      ],
      "verify:marion-round6 must inherit Round 1–5 through verify:marion-round5, then run Round 6."
    );
  }
);

"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {abs,readJson,loadExact}=require("./_round5_common.js");
const PRIOR=Object.freeze(["tests/marion/layers_1_28/round1/run_round1_certification.js","tests/marion/layers_1_28/round2/run_round2_certification.js","tests/marion/layers_1_28/round3/run_round3_certification.js","tests/marion/layers_1_28/round4/run_round4_certification.js"]);
const LAYER_TESTS=Object.freeze(["tests/marion/marionStrategicPlanner.test.js","tests/marion/marionPriorityArbitrator.test.js","tests/marion/marionLayer27Integration.test.js","tests/marion/marionReasoningAuditor.test.js","tests/marion/marionQualityCalibrator.test.js","tests/marion/marionLayer28Integration.test.js","tests/marion/marionLayers27_28Regression.test.js"]);
test("Round 5.5 Rounds 1 through 4 and Layer 27/28 prerequisites remain present",()=>{const missing=[...PRIOR,...LAYER_TESTS].filter(rel=>!fs.existsSync(abs(rel)));assert.deepEqual(missing,[],`Round 5 prerequisite files are missing: ${missing.join(", ")}`);});
test("Round 5.5 service certification does not advance Marion beyond Layer 28",()=>{const supervisor=loadExact("Data/marion/runtime/supervision/marionCognitiveSupervisor.js");assert.equal(Number(supervisor.HARD_STOP_LAYER),28,"Cognitive Supervisor hard stop drifted beyond Layer 28.");if(typeof supervisor.getStatus==="function"){const status=supervisor.getStatus();assert.equal(Number(status.hardStopLayer),28);assert.notEqual(status.executionAuthorized,true);}const manifest=readJson("tests/marion/layers_1_28/round5/round5_certification_manifest.json");assert.equal(manifest.hardStopLayer,28,"Round 5 certification manifest must not introduce Layer 29.");});

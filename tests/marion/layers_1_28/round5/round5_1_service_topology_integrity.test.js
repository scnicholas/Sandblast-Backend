"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {CORE_SERVICES,abs,loadExact,assertCommonJsApi,readJson,npmRunReferences,CANONICAL_METACOGNITION_ROOT,assertCanonicalMetacognitionTree,assertSupervisorUsesCanonicalMetacognitionPath}=require("./_round5_common.js");
test("Round 5.1 canonical Marion service topology exists and loads under CommonJS",()=>{for(const rel of CORE_SERVICES){assert.ok(fs.existsSync(abs(rel)),`Missing service authority: ${rel}`);assertCommonJsApi(loadExact(rel),rel);}});
test("Round 5.1 package Round 5 pathways remain cohesive with Round 4",()=>{const pkg=readJson("package.json");assert.equal(pkg.type,"commonjs");assert.equal(pkg.scripts["test:marion-round4"],"node tests/marion/layers_1_28/round4/run_round4_certification.js");assert.equal(pkg.scripts["test:marion-round5"],"node tests/marion/layers_1_28/round5/run_round5_certification.js");assert.deepEqual(npmRunReferences(pkg.scripts["verify:marion-round5"]),["verify:marion-round4","test:marion-round5"]);});

test("Round 5.1 canonical Layer 28 metacognition topology is exact",()=>{const files=assertCanonicalMetacognitionTree();assert.equal(files.length,13);assert.equal(CANONICAL_METACOGNITION_ROOT,"Data/marion/runtime/metacognition");assert.equal(assertSupervisorUsesCanonicalMetacognitionPath(),true);});

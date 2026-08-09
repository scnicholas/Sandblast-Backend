"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const cp=require("child_process");
const {performance}=require("perf_hooks");
const ROOT=path.resolve(__dirname,"../../../..");
const ROUND_DIR=__dirname;
const WARNING_RE=/Accessing non-existent property|inside circular dependency/i;
const CONFLICT_RE=/^(?:<<<<<<<|=======|>>>>>>>)/m;
const INTERNAL_LEAK_RE=/\b(?:TypeError|ReferenceError|SyntaxError|diagnostic packet|stack trace|recovery path engaged|secret diagnostic)\b/i;
const CORE_SERVICES=Object.freeze([
  "Data/marion/runtime/marionBridge.js",
  "Data/marion/runtime/composeMarionResponse.js",
  "Data/marion/runtime/supervision/marionCognitiveSupervisor.js",
  "utils/chatEngine.js",
  "utils/stateSpine.js"
]);

const CANONICAL_METACOGNITION_ROOT = "Data/marion/runtime/metacognition";
const METACOGNITION_FILES = Object.freeze([
  "marionMetaReasoner.js",
  "marionReflectionEngine.js",
  "marionConfidenceAnalyzer.js",
  "marionBiasDetector.js",
  "marionKnowledgeGapDetector.js",
  "marionReasoningAuditor.js",
  "marionResponseEvaluator.js",
  "marionQualityCalibrator.js",
  "marionLearningSignalCollector.js",
  "marionAdaptiveImprovementEngine.js",
  "marionMetaReasoningPolicy.js",
  "marionMetaTelemetry.js",
  "marionReflectionEnvelope.js"
]);
const CANONICAL_METACOGNITION_FILES = Object.freeze(
  METACOGNITION_FILES.map((name) => `${CANONICAL_METACOGNITION_ROOT}/${name}`)
);
function abs(p){return path.resolve(ROOT,p);}
function isObject(v){return !!(v&&typeof v==="object"&&!Array.isArray(v));}
function safeString(v){try{return String(v==null?"":v);}catch(_){return "";}}
function norm(p){return path.normalize(p).toLowerCase();}
function readText(rel){const f=abs(rel);assert.ok(fs.existsSync(f),`Required file is missing: ${rel}`);const s=fs.readFileSync(f,"utf8");assert.strictEqual(CONFLICT_RE.test(s),false,`Merge-conflict marker found: ${rel}`);return s;}
function readJson(rel){const s=readText(rel);try{return JSON.parse(s);}catch(e){assert.fail(`Invalid JSON in ${rel}: ${e&&e.message?e.message:e}`);}}
function resolveExact(rel){const c=abs(rel);assert.ok(fs.existsSync(c),`Required module is missing: ${rel}`);const r=require.resolve(c);assert.strictEqual(norm(r),norm(c),`Module resolution drifted: ${rel}`);return r;}
function loadExact(rel){const r=resolveExact(rel);try{return require(r);}catch(e){throw new Error([`Module failed during loading: ${rel}`,`Resolved: ${r}`,`Cause: ${e&&e.message?e.message:e}`].join("\n"),{cause:e});}}

function assertCanonicalMetacognitionTree() {
  const missing=CANONICAL_METACOGNITION_FILES.filter((relativePath)=>!fs.existsSync(abs(relativePath)));
  assert.deepStrictEqual(missing,[],`Canonical Layer 28 metacognition files are missing: ${missing.join(", ")}`);
  for(const relativePath of CANONICAL_METACOGNITION_FILES) resolveExact(relativePath);
  return [...CANONICAL_METACOGNITION_FILES];
}
function assertSupervisorUsesCanonicalMetacognitionPath() {
  const source=readText("Data/marion/runtime/supervision/marionCognitiveSupervisor.js");
  assert.strictEqual(/path\.join\(\s*__dirname\s*,\s*["']metacognition["']\s*\)/m.test(source),false,
    "Cognitive Supervisor still resolves stale supervision/metacognition.");
  assert.ok(/path\.join\(\s*__dirname\s*,\s*["']\.\.["']\s*,\s*["']metacognition["']\s*\)/m.test(source),
    "Cognitive Supervisor does not resolve canonical runtime/metacognition.");
  return true;
}

function ownFunction(t,n){if(!t||(typeof t!=="object"&&typeof t!=="function"))return null;try{const d=Object.getOwnPropertyDescriptor(t,n);return d&&typeof d.value==="function"?d.value:null;}catch(_){return null;}}
function callable(t,names){if(typeof t==="function")return t;for(const n of names){const fn=ownFunction(t,n);if(fn)return fn.bind(t);}return null;}
function assertCommonJsApi(api,label){assert.ok(api&&(typeof api==="object"||typeof api==="function"),`${label} did not load as a CommonJS API.`);}
function syntaxCheck(file){const r=cp.spawnSync(process.execPath,["--check",file],{cwd:ROOT,encoding:"utf8",windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});assert.strictEqual(r.error,undefined,r.error&&r.error.message);assert.strictEqual(r.status,0,[`Syntax check failed: ${path.relative(ROOT,file)}`,r.stdout||"",r.stderr||""].join("\n"));}
function runIsolated(name,source,timeout=60000){const started=performance.now();const r=cp.spawnSync(process.execPath,["--trace-warnings","-e",source],{cwd:ROOT,env:{...process.env,NODE_OPTIONS:"",SB_TTS_LOG_ENABLED:"false"},encoding:"utf8",windowsHide:true,timeout,maxBuffer:16*1024*1024});const durationMs=performance.now()-started;assert.strictEqual(r.error,undefined,r.error&&r.error.message);const output=`${r.stdout||""}\n${r.stderr||""}`;assert.strictEqual(r.status,0,[`Isolated case failed: ${name}`,output].join("\n"));assert.strictEqual(WARNING_RE.test(output),false,[`Circular warning detected: ${name}`,output].join("\n"));return{name,ok:true,warnings:0,durationMs:Number(durationMs.toFixed(3)),stdout:safeString(r.stdout).trim()};}
function assertNoVisibleDiagnostics(v){assert.strictEqual(INTERNAL_LEAK_RE.test(safeString(v)),false,"User-facing service output contains internal diagnostics.");}
function byteLength(v){return Buffer.byteLength(JSON.stringify(v),"utf8");}
function npmRunReferences(c){return[...String(c||"").matchAll(/\bnpm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/g)].map(m=>m[1]);}
module.exports={ROOT,ROUND_DIR,WARNING_RE,CONFLICT_RE,INTERNAL_LEAK_RE,CORE_SERVICES,CANONICAL_METACOGNITION_ROOT,METACOGNITION_FILES,CANONICAL_METACOGNITION_FILES,abs,isObject,safeString,norm,readText,readJson,resolveExact,loadExact,ownFunction,callable,assertCommonJsApi,syntaxCheck,runIsolated,assertNoVisibleDiagnostics,byteLength,npmRunReferences,assertCanonicalMetacognitionTree,assertSupervisorUsesCanonicalMetacognitionPath};

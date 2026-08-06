"use strict";

/**
 * Marion Layers 1–28 — Round 1 Baseline Certification
 * Canonical path:
 * tests/marion/layers_1_28/round1/run_round1_certification.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const VERSION = "marion.layers1_28.round1Certification/2.0-cohesive";
const ROOT = path.resolve(__dirname, "../../../..");
const ROUND_DIR = __dirname;
const SELF = path.basename(__filename);
const WARNING_RE = /Accessing non-existent property|inside circular dependency/i;
const CONFLICT_RE = /^(?:<<<<<<<|=======|>>>>>>>)/m;

const REQUIRED = Object.freeze([
  "package.json",
  "manifest.json",
  "Data/marion/runtime/marionBridge.js",
  "Data/marion/runtime/composeMarionResponse.js",
  "utils/chatEngine.js",
  "utils/stateSpine.js"
]);

const OPTIONAL = Object.freeze([
  "Data/marion/runtime/marionIntentRouter.js",
  "Data/marion/runtime/marionDomainRegistry.js",
  "Data/marion/runtime/marionFinalEnvelope.js",
  "Data/marion/runtime/marionLoopGuard.js",
  "Data/marion/runtime/marionCurrentTurnAuthority.js",
  "Data/marion/runtime/privateOperatorBoundaryLock.js",
  "Data/marion/runtime/publicIdentityQuestionRefinement.js",
  "Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js",
  "Data/marion/runtime/supervision/marionCognitiveSupervisor.js",
  "utils/nyx_state_controller.js"
]);

function abs(file) { return path.resolve(ROOT, file); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function ownFunction(target, name) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) return null;
  try {
    const d = Object.getOwnPropertyDescriptor(target, name);
    return d && typeof d.value === "function" ? d.value : null;
  } catch (_) { return null; }
}
function hasCallable(target, names) {
  return typeof target === "function" || names.some((name) => !!ownFunction(target, name));
}
function readText(file) {
  const full = abs(file);
  assert.ok(fs.existsSync(full), `Required file is missing: ${file}`);
  const text = fs.readFileSync(full, "utf8");
  assert.strictEqual(CONFLICT_RE.test(text), false, `Merge-conflict marker found: ${file}`);
  return text;
}
function readJson(file) {
  const text = readText(file);
  try { return JSON.parse(text); }
  catch (error) { assert.fail(`Invalid JSON in ${file}: ${error.message}`); }
}
function syntaxCheck(file) {
  const r = childProcess.spawnSync(process.execPath, ["--check", file], {
    cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 30000,
    maxBuffer: 4 * 1024 * 1024
  });
  assert.strictEqual(r.error, undefined, r.error && r.error.message);
  assert.strictEqual(r.status, 0, [`Syntax check failed: ${path.relative(ROOT,file)}`, r.stdout || "", r.stderr || ""].join("\n"));
}
function runIsolated(name, source, timeout = 60000) {
  const r = childProcess.spawnSync(process.execPath, ["--trace-warnings", "-e", source], {
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: "", SB_TTS_LOG_ENABLED: "false" },
    encoding: "utf8", windowsHide: true, timeout, maxBuffer: 12 * 1024 * 1024
  });
  assert.strictEqual(r.error, undefined, r.error && r.error.message);
  const output = `${r.stdout || ""}\n${r.stderr || ""}`;
  assert.strictEqual(r.status, 0, [`Isolated case failed: ${name}`, output].join("\n"));
  assert.strictEqual(WARNING_RE.test(output), false, [`Circular warning detected: ${name}`, output].join("\n"));
  return { name, ok: true, warnings: 0, stdout: String(r.stdout || "").trim() };
}
function assertPackage() {
  const pkg = readJson("package.json");
  assert.ok(isObj(pkg.scripts), "package.json scripts are missing.");
  assert.strictEqual(pkg.scripts["test:marion-round1"], "node tests/marion/layers_1_28/round1/run_round1_certification.js", "Round 1 package path drifted.");
  assert.strictEqual(pkg.type, "commonjs", "CommonJS architecture changed.");
  assert.ok(isObj(pkg.engines) && typeof pkg.engines.node === "string" && pkg.engines.node.trim(), "Node engine declaration is missing.");
  return { name: String(pkg.name || ""), version: String(pkg.version || ""), node: pkg.engines.node };
}
function assertFiles() {
  const missing = REQUIRED.filter((file) => !fs.existsSync(abs(file)));
  assert.deepStrictEqual(missing, [], `Missing Round 1 core files: ${missing.join(", ")}`);
  return OPTIONAL.filter((file) => fs.existsSync(abs(file)));
}
function assertManifest() {
  const manifest = readJson("manifest.json");
  const summary = isObj(manifest.summary) ? manifest.summary : {};
  const architecture = isObj(manifest.architecture) ? manifest.architecture : {};
  const layers = Array.isArray(summary.conversationLayersIncluded) ? summary.conversationLayersIncluded.map(Number).filter(Number.isInteger) : [];
  const missing = [];
  for (let layer = 1; layer <= 28; layer += 1) if (!layers.includes(layer)) missing.push(layer);
  assert.deepStrictEqual(missing, [], `Manifest is missing Layers 1–28: ${missing.join(", ")}`);
  const summaryHardStop = Number(summary.hardStopLayer);
  const architectureHardStop = Number(architecture.hardStopLayer);
  assert.ok(Number.isInteger(summaryHardStop) && summaryHardStop >= 28, "Manifest summary hard stop must include Layer 28.");
  assert.ok(Number.isInteger(architectureHardStop) && architectureHardStop >= 28, "Manifest architecture hard stop must include Layer 28.");
  return { layers: layers.filter((n) => n >= 1 && n <= 28), summaryHardStop, architectureHardStop };
}
function checkSyntax() {
  const files = [...REQUIRED, ...OPTIONAL]
    .filter((file) => file.endsWith(".js") && fs.existsSync(abs(file)))
    .map(abs);
  files.forEach(syntaxCheck);
  return files.map((file) => path.relative(ROOT, file));
}
function coreProbe(order) {
  return `
    "use strict";
    const assert=require("assert");
    function ownFunction(t,n){if(!t||(typeof t!=="object"&&typeof t!=="function"))return null;const d=Object.getOwnPropertyDescriptor(t,n);return d&&typeof d.value==="function"?d.value:null}
    function has(t,n){return typeof t==="function"||n.some(x=>!!ownFunction(t,x))}
    const loaded=new Map();
    for(const p of ${JSON.stringify(order)}) loaded.set(p,require(p));
    const bridge=loaded.get("./Data/marion/runtime/marionBridge.js")||require("./Data/marion/runtime/marionBridge.js");
    const composer=loaded.get("./Data/marion/runtime/composeMarionResponse.js")||require("./Data/marion/runtime/composeMarionResponse.js");
    const chat=loaded.get("./utils/chatEngine.js")||require("./utils/chatEngine.js");
    const state=loaded.get("./utils/stateSpine.js")||require("./utils/stateSpine.js");
    assert.ok(has(bridge,["processWithMarion","handleMarionAdminConversation","route","ask","handle","default"]),"MarionBridge has no callable entry point.");
    assert.ok(has(composer,["composeMarionResponse","compose","run","buildReply","default"]),"Composer has no callable entry point.");
    assert.ok(has(chat,["handleChat","processWithMarion","run","handle","route","default"]),"ChatEngine has no callable entry point.");
    assert.ok(has(state,["createState","hydrate","coerceState","finalizeTurn","normalizeStateForPipelineCohesion","default"]),"StateSpine has no callable entry point.");
    console.log(JSON.stringify({ok:true,order:${JSON.stringify(order)}}));
  `;
}
function loadChecks() {
  const order=["./Data/marion/runtime/marionBridge.js","./Data/marion/runtime/composeMarionResponse.js","./utils/chatEngine.js","./utils/stateSpine.js"];
  return [runIsolated("round1-canonical-core-load",coreProbe(order)),runIsolated("round1-reverse-core-load",coreProbe([...order].reverse()))];
}
function isRound1Test(name) {
  if (name === SELF || name.startsWith("_") || !name.endsWith(".js")) return false;
  if (/^run_round\d+_certification\.js$/i.test(name)) return false;
  return /(?:^|[_\-.])(?:test|certification)(?:[_\-.]|$)/i.test(name);
}
function discoverTests() {
  return fs.readdirSync(ROUND_DIR,{withFileTypes:true})
    .filter((e)=>e.isFile()&&isRound1Test(e.name))
    .map((e)=>path.join(ROUND_DIR,e.name))
    .sort((a,b)=>a.localeCompare(b));
}
function runTest(file) {
  syntaxCheck(file);
  const r=childProcess.spawnSync(process.execPath,["--trace-warnings",file],{
    cwd:ROOT,env:{...process.env,NODE_OPTIONS:"",SB_TTS_LOG_ENABLED:"false"},encoding:"utf8",windowsHide:true,timeout:90000,maxBuffer:16*1024*1024
  });
  assert.strictEqual(r.error,undefined,r.error&&r.error.message);
  const output=`${r.stdout||""}\n${r.stderr||""}`;
  assert.strictEqual(r.status,0,[`Round 1 test failed: ${path.basename(file)}`,output].join("\n"));
  assert.strictEqual(WARNING_RE.test(output),false,[`Circular warning in ${path.basename(file)}`,output].join("\n"));
  return {file:path.basename(file),ok:true,warnings:0,stdout:String(r.stdout||"").trim()};
}
function main() {
  const packageProfile=assertPackage();
  const optionalPresent=assertFiles();
  const manifest=assertManifest();
  const syntaxChecks=checkSyntax();
  const isolatedLoadChecks=loadChecks();
  const discovered=discoverTests();
  const executed=discovered.map(runTest);
  console.log(JSON.stringify({
    ok:true,certification:"marion-layers-1-28-round1",version:VERSION,backendRoot:ROOT,
    package:packageProfile,requiredCoreFiles:REQUIRED.length,optionalCohesionFilesPresent:optionalPresent,
    manifest,syntaxChecks,isolatedLoadChecks,discoveredRound1Tests:discovered.map(path.basename),executedRound1Tests:executed,
    circularWarnings:0,failFast:true
  },null,2));
}
try { main(); }
catch (error) { console.error(error&&error.stack?error.stack:error); process.exitCode=1; }

"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const PACKAGE_PATH = path.join(ROOT, "package.json");
const VERSION = "sandblast.aggregateCertificationManifest/1.0";
const FULL_STEPS = Object.freeze([
  "verify:aggregate-manifest",
  "lint:syntax",
  "verify:marion-critical",
  "verify:marion-admin-e2e",
  "verify:marion-phase-a-part1",
  "test:marion-layering",
  "verify:marion-phase-b",
  "verify:marion-round6",
  "verify:nyx-voice",
  "verify:sandblast-tv"
]);
const REQUIRED = Object.freeze([
  "verify","verify:full","verify:aggregate-manifest","lint:syntax","lint:nyx-voice-runtime",
  "test:marion-circular-dependencies","verify:marion-critical","verify:marion-admin-e2e",
  "verify:marion-phase-a-part1","verify:marion-phase-b","verify:marion-round6","verify:nyx-voice",
  "verify:nyx-voice-parity","verify:sandblast-tv","test:nyx-widget","test:nyx-widget-playback",
  "test:nyx-route-mount","test:nyx-voice","test:nyx-voice-boundary","test:nyx-voice-parity",
  "test:marion-substantive-response-contract","test:marion-admin-e2e-contract",
  "test:marion-phase-b-state","test:marion-phase-b-transport","test:marion-phase-b-control"
]);
function refs(command){return [...String(command||"").matchAll(/\bnpm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/g)].map(m=>m[1]);}
assert.ok(fs.existsSync(PACKAGE_PATH), `package.json not found: ${PACKAGE_PATH}`);
const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH,"utf8"));
const scripts = pkg.scripts || {};
assert.deepStrictEqual(REQUIRED.filter(n=>!Object.prototype.hasOwnProperty.call(scripts,n)),[],"Required scripts are missing.");
const missing=[];
for(const [name,command] of Object.entries(scripts)) for(const ref of refs(command)) if(!Object.prototype.hasOwnProperty.call(scripts,ref)) missing.push({script:name,missing:ref});
assert.deepStrictEqual(missing,[],`Missing npm script references: ${JSON.stringify(missing)}`);
const visiting=new Set(),visited=new Set();
function visit(name,stack=[]){if(visited.has(name))return;if(visiting.has(name))assert.fail(`npm script cycle: ${[...stack,name].join(" -> ")}`);visiting.add(name);for(const ref of refs(scripts[name]))visit(ref,[...stack,name]);visiting.delete(name);visited.add(name);}
Object.keys(scripts).forEach(name=>visit(name));
assert.strictEqual(scripts.verify,"npm run verify:full");
assert.deepStrictEqual(refs(scripts["verify:full"]),FULL_STEPS,"verify:full order is incorrect.");
const phaseB=refs(scripts["verify:marion-phase-b"]);
for(const name of ["test:marion-phase-b-core","test:marion-phase-b-batch1","test:marion-phase-b-state","test:marion-phase-b-transport","test:marion-phase-b-control","verify:marion-phase-b-part2-batch2"])assert.ok(phaseB.includes(name),`verify:marion-phase-b missing ${name}`);
const critical=String(scripts["verify:marion-critical"]||"");
for(const marker of ["privateOperatorBoundaryLock.js","publicIdentityQuestionRefinement.js","voiceTextParityIdentityDriftHardlock.js","test:marion-circular-dependencies"])assert.ok(critical.includes(marker),`verify:marion-critical missing ${marker}`);
const voice=String(scripts["verify:nyx-voice"]||"");
for(const name of ["lint:nyx-voice-runtime","test:nyx-voice","test:nyx-voice-boundary","test:nyx-voice-parity","test:nyx-route-mount","test:nyx-widget","test:nyx-widget-playback"])assert.ok(voice.includes(`npm run ${name}`),`verify:nyx-voice missing ${name}`);
console.log(JSON.stringify({ok:true,certification:"sandblast-aggregate-script-manifest",version:VERSION,package:pkg.name,packageVersion:pkg.version,canonicalCommand:"npm run verify",aggregateScript:"verify:full",aggregateSteps:FULL_STEPS,scriptCount:Object.keys(scripts).length,missingReferences:0,scriptCycles:0,phaseBComplete:true,circularDependencyGate:true,nyxVoiceGate:true},null,2));

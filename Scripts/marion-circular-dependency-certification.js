"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.resolve(__dirname,"..");
const VERSION = "marion.circularDependencyCertification/1.0";
const WARNING_RE = /Accessing non-existent property|inside circular dependency/i;
const CASES = Object.freeze([
  {name:"public-identity-then-hardlock",modules:["./Data/marion/runtime/publicIdentityQuestionRefinement.js","./Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js"],assertions:[["./Data/marion/runtime/publicIdentityQuestionRefinement.js","phase3dVoiceTextParityProject"],["./Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js","projectResult"]]},
  {name:"hardlock-then-public-identity",modules:["./Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js","./Data/marion/runtime/publicIdentityQuestionRefinement.js"],assertions:[["./Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js","projectResult"],["./Data/marion/runtime/publicIdentityQuestionRefinement.js","phase3dVoiceTextParityProject"]]},
  {name:"private-boundary-then-hardlock",modules:["./Data/marion/runtime/privateOperatorBoundaryLock.js","./Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js"],assertions:[["./Data/marion/runtime/privateOperatorBoundaryLock.js","isVerifiedOperatorContext"],["./Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js","projectResult"]]},
  {name:"marion-bridge-load",modules:["./Data/marion/runtime/marionBridge.js"],assertions:[["./Data/marion/runtime/marionBridge.js","handleMarionAdminConversation"],["./Data/marion/runtime/marionBridge.js","processWithMarion"]]}
]);
function probe(test){return `"use strict";const assert=require("assert");function ownFunction(t,n){if(!t||(typeof t!=="object"&&typeof t!=="function"))return null;const d=Object.getOwnPropertyDescriptor(t,n);return d&&typeof d.value==="function"?d.value:null;}const loaded=new Map();for(const p of ${JSON.stringify(test.modules)})loaded.set(p,require(p));for(const [p,n] of ${JSON.stringify(test.assertions)}){const t=loaded.has(p)?loaded.get(p):require(p);assert.strictEqual(typeof ownFunction(t,n),"function",p+" must own callable export "+n);}console.log(${JSON.stringify(test.name+": PASS")});`;}
function run(test){for(const p of test.modules)assert.ok(fs.existsSync(path.resolve(ROOT,p)),`Module missing: ${p}`);const r=cp.spawnSync(process.execPath,["--trace-warnings","-e",probe(test)],{cwd:ROOT,env:{...process.env,NODE_OPTIONS:""},encoding:"utf8",maxBuffer:8*1024*1024,windowsHide:true});const out=String(r.stdout||""),err=String(r.stderr||"");assert.strictEqual(r.error,undefined,r.error&&r.error.message);assert.strictEqual(r.status,0,[`Case failed: ${test.name}`,out,err].join("\n"));assert.strictEqual(WARNING_RE.test(out+"\n"+err),false,[`Circular warning: ${test.name}`,out,err].join("\n"));return{name:test.name,ok:true,stdout:out.trim(),warningCount:0};}
const results=CASES.map(run);
console.log(JSON.stringify({ok:true,certification:"marion-circular-dependency-cleanliness",version:VERSION,cases:results,warnings:0},null,2));

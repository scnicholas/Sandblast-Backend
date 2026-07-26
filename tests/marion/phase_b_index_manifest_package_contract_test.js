"use strict";
const fs=require("fs");
const path=require("path");
const ROOT=path.resolve(__dirname,"../..");

function assert(condition,message){if(!condition)throw new Error(message);}

const indexText=fs.readFileSync(path.join(ROOT,"index.js"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,"manifest.json"),"utf8"));
const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,"package.json"),"utf8"));

assert(indexText.includes("MARION_NUANCE_PHASE_B_INDEX_DIAGNOSTIC_BOUNDARY_V1_START"),"Index Phase B boundary is missing.");
assert(indexText.includes('semanticAnalysisPerformed:false'),"Index diagnostic-only control is missing.");
assert(indexText.includes('/api/marion/nuance/phase-b/health'),"Phase B health route is missing.");

assert(manifest.summary.hardStopLayer===26,"Manifest hard stop must be 26.");
assert(manifest.architecture.hardStopLayer===26,"Manifest architecture hard stop must be 26.");
assert(manifest.summary.conversationLayersIncluded.includes(25),"Layer 25 is missing from the manifest.");
assert(manifest.summary.conversationLayersIncluded.includes(26),"Layer 26 is missing from the manifest.");
assert(manifest.phaseBNuanceIntegration,"Phase B manifest section is missing.");
assert(manifest.phaseBNuanceIntegration.literalIntentPreserved===true,"Literal-intent preservation is missing.");
assert(manifest.phaseBNuanceIntegration.automaticExecutionAllowed===false,"Execution boundary is missing.");

assert(pkg.scripts["verify:marion-phase-b"],"Phase B verification script is missing.");
assert(pkg.scripts["verify:marion-phase-b-part2-batch2"],"Batch 2 verification script is missing.");
assert(pkg.type==="commonjs","CommonJS architecture changed.");
assert(pkg.engines&&pkg.engines.node,"Node engine declaration is missing.");

console.log(JSON.stringify({
  ok:true,
  manifestHardStop:manifest.summary.hardStopLayer,
  packageVersion:pkg.version,
  commonjsPreserved:true
},null,2));

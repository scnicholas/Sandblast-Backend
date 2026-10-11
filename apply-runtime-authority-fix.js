#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');

const PHASE_A_OLD = 'if(!valid){delete out.nuanceContext;delete out.phaseANuance;delete out.nuanceStatePatch;out.staleNuanceRejected=true;out.staleNuanceRejectedReason="turn_or_contract_mismatch";}';
const PHASE_A_NEW = `if(!valid){
      /* RUNTIME_AUTHORITY_PHASE_A_FAIL_CLOSED_V1 */
      delete out.nuanceContext;
      delete out.phaseANuance;
      delete out.nuanceStatePatch;
      for (const key of ["nuanceCurrentTurnVerified", "nuanceInteractionState", "nuanceCorrectionOverride", "currentTurnNuanceOverride", "staleEmotionMustYield"]) delete out[key];
      out.staleNuanceRejected=true;
      out.staleNuanceRejectedReason="turn_or_contract_mismatch";
    }`;

const PHASE_B_OLD = 'if(!valid(b,id)){const out={...input};delete out.phaseBNuance;delete out.nuancePhaseBContext;delete out.phaseBStatePatch;out.stalePhaseBNuanceRejected=true;out.stalePhaseBNuanceRejectedReason="turn_or_contract_mismatch";return out;}';
const PHASE_B_NEW = `if(!valid(b,id)){
    /* RUNTIME_AUTHORITY_PHASE_B_FAIL_CLOSED_V1 */
    const out={...input};
    delete out.phaseBNuance;
    delete out.nuancePhaseBContext;
    delete out.phaseBStatePatch;
    for (const key of ["phaseBNuanceCurrentTurnVerified", "phaseBPrimaryStance", "phaseBPrimaryPragmaticIntent", "phaseBCorrectionOverride", "currentTurnNuanceOverride", "staleEmotionMustYield", "stalePragmaticIntentMustYield"]) delete out[key];
    out.stalePhaseBNuanceRejected=true;
    out.stalePhaseBNuanceRejectedReason="turn_or_contract_mismatch";
    return out;
  }`;

const TEST_START = "test('Phase A and B";
const TEST_END = "test('public requests remain outside private Phase B nuance projection'";
const FOCUSED_TEST_PATTERN = 'Phase A and B reject incomplete envelope proofs';
const POST_GUARD_MARKER = "RUNTIME_AUTHORITY_POST_PREPARE_FAIL_CLOSED_V2";
const POST_GUARD_SOURCE = "/* RUNTIME_AUTHORITY_POST_PREPARE_FAIL_CLOSED_V2 */\n(function marionNuancePostPrepareFailClosedV2(){\n  \"use strict\";\n  const api=module.exports&&typeof module.exports===\"object\"?module.exports:null;\n  if(!api||api.__marionNuancePostPrepareFailClosedV2)return;\n  const originalPrepare=api.prepareInput;\n  if(typeof originalPrepare!==\"function\")return;\n  const PHASE_A=\"nyx.marion.nuance.phaseA/1.0\";\n  const PHASE_B=\"nyx.marion.nuance.phaseB/1.0\";\n  function obj(v){return v&&typeof v===\"object\"&&!Array.isArray(v)?v:{};}\n  function roots(v){const x=obj(v);return [x,obj(x.body),obj(x.payload),obj(x.session),obj(x.meta)];}\n  function privateContext(v){\n    try{if(typeof api.isPrivateMarionContext===\"function\")return api.isPrivateMarionContext(v)===true;}catch(_){}\n    return roots(v).some(x=>x.privateAdminConversation===true||x.marionAdminConversation===true||x.directMarionAdminInterface===true||x.authenticatedOperator===true||x.adminVerified===true);\n  }\n  function candidate(v,keys,contract,phase){\n    for(const root of roots(v))for(const key of keys){const n=obj(root[key]);if(n.contract===contract&&n.phase===phase)return n;}\n    return null;\n  }\n  function flag(v,keys){return roots(v).some(root=>keys.some(key=>root[key]===true));}\n  function validate(name,v){\n    try{const fn=api[name];if(typeof fn!==\"function\")return false;return obj(fn.call(api,v)).ok===true;}catch(_){return false;}\n  }\n  function inspect(v){\n    const isPrivate=privateContext(v);\n    if(!isPrivate)return {private:false,aClaimed:false,bClaimed:false,aInvalid:false,bInvalid:false,preserveFromA:false,preserveFromB:false,orphanShared:false};\n    const a=candidate(v,[\"nuanceContext\",\"phaseANuance\"],PHASE_A,\"A\");\n    const b=candidate(v,[\"phaseBNuance\",\"nuancePhaseBContext\",\"phaseBContext\"],PHASE_B,\"B\");\n    const aClaimed=!!a||flag(v,[\"nuanceCurrentTurnVerified\",\"nuanceCorrectionOverride\",\"nuanceInteractionState\"]);\n    const bClaimed=!!b||flag(v,[\"phaseBNuanceCurrentTurnVerified\",\"phaseBPrimaryStance\",\"phaseBPrimaryPragmaticIntent\",\"phaseBCorrectionOverride\"]);\n    const aOk=!aClaimed||validate(\"validateNuanceForCurrentTurn\",v);\n    const bOk=!bClaimed||validate(\"validatePhaseBNuanceForCurrentTurn\",v);\n    return {\n      private:true,aClaimed,bClaimed,aOk,bOk,\n      aInvalid:aClaimed&&!aOk,bInvalid:bClaimed&&!bOk,\n      preserveFromA:aClaimed&&aOk&&flag(v,[\"nuanceCorrectionOverride\"]),\n      preserveFromB:bClaimed&&bOk&&flag(v,[\"phaseBCorrectionOverride\"]),\n      orphanShared:!aClaimed&&!bClaimed&&flag(v,[\"currentTurnNuanceOverride\"])\n    };\n  }\n  function strip(value,keys){\n    if(!value||typeof value!==\"object\"||Array.isArray(value))return value;\n    const out={...value};\n    for(const key of keys)delete out[key];\n    for(const name of [\"body\",\"payload\",\"session\",\"meta\"]){\n      const nested=obj(out[name]);\n      if(Object.keys(nested).length){const clean={...nested};for(const key of keys)delete clean[key];out[name]=clean;}\n    }\n    return out;\n  }\n  function finish(value,state){\n    if(!state.private||!value||typeof value!==\"object\"||Array.isArray(value))return value;\n    let out=value;\n    if(state.aInvalid){\n      const keys=[\"nuanceContext\",\"phaseANuance\",\"nuanceStatePatch\",\"nuanceCurrentTurnVerified\",\"nuanceInteractionState\",\"nuanceCorrectionOverride\",\"internalNuanceTurnId\",\"nuanceCurrentTurnIntegrationVersion\"];\n      if(!state.preserveFromB)keys.push(\"currentTurnNuanceOverride\",\"staleEmotionMustYield\");\n      out=strip(out,keys);\n      out.staleNuanceRejected=true;\n      out.staleNuanceRejectedReason=\"turn_or_contract_mismatch\";\n    }\n    if(state.bInvalid){\n      const keys=[\"phaseBNuance\",\"nuancePhaseBContext\",\"phaseBContext\",\"phaseBStatePatch\",\"phaseBNuanceCurrentTurnVerified\",\"phaseBPrimaryStance\",\"phaseBPrimaryPragmaticIntent\",\"phaseBCorrectionOverride\",\"literalIntentPreserved\",\"nuanceHardStopLayer\",\"stalePragmaticIntentMustYield\"];\n      if(!state.preserveFromA)keys.push(\"currentTurnNuanceOverride\",\"staleEmotionMustYield\");\n      out=strip(out,keys);\n      out.stalePhaseBNuanceRejected=true;\n      out.stalePhaseBNuanceRejectedReason=\"turn_or_contract_mismatch\";\n    }\n    if(state.orphanShared){\n      out=strip(out,[\"currentTurnNuanceOverride\",\"staleEmotionMustYield\",\"stalePragmaticIntentMustYield\"]);\n      out.staleNuanceRejected=true;\n      out.staleNuanceRejectedReason=\"turn_or_contract_mismatch\";\n    }\n    return out;\n  }\n  api.prepareInput=function(){\n    const raw=arguments[0];\n    const state=inspect(raw);\n    const result=originalPrepare.apply(this,arguments);\n    return result&&typeof result.then===\"function\"?result.then(value=>finish(value,state)):finish(result,state);\n  };\n  api.__marionNuancePostPrepareFailClosedV2=true;\n})();";

function parseArgs(argv) {
  const options = { repoRoot: process.cwd(), checkOnly: false, skipTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--repo-root') {
      if (!argv[i + 1]) throw new Error('--repo-root requires a path.');
      options.repoRoot = path.resolve(argv[++i]);
    } else if (argv[i] === '--check-only') {
      options.checkOnly = true;
    } else if (argv[i] === '--skip-test') {
      options.skipTest = true;
    } else {
      throw new Error(`Unknown option: ${argv[i]}`);
    }
  }
  return options;
}

function countExact(text, needle) {
  let count = 0;
  let position = 0;
  while ((position = text.indexOf(needle, position)) !== -1) {
    count += 1;
    position += needle.length;
  }
  return count;
}

function applyExactPatch(source, label, oldText, newText, marker) {
  const oldCount = countExact(source, oldText);
  const markerCount = countExact(source, marker);
  if (markerCount === 1 && oldCount === 0) return { text: source, changed: false };
  if (markerCount !== 0 || oldCount !== 1) {
    throw new Error(`${label}: expected one known source block or one already-applied marker; found ${oldCount} old block(s) and ${markerCount} marker(s). No files were changed.`);
  }
  return { text: source.replace(oldText, newText), changed: true };
}

function appendPostGuard(source) {
  const markerCount = countExact(source, POST_GUARD_MARKER);
  if (markerCount === 1) return { text: source, changed: false };
  if (markerCount !== 0) throw new Error("Post-prepare guard marker is duplicated. No files were changed.");
  return { text: source.replace(/\s*$/, "") + "\n\n" + POST_GUARD_SOURCE + "\n", changed: true };
}

function extractTestBlock(text, label) {
  const starts = countExact(text, TEST_START);
  const ends = countExact(text, TEST_END);
  const start = text.indexOf(TEST_START);
  const end = start < 0 ? -1 : text.indexOf(TEST_END, start + TEST_START.length);
  if (starts !== 1 || ends !== 1 || end < 0) {
    throw new Error(`${label}: expected one Phase A/B test block followed by its known next-test anchor. No files were changed.`);
  }
  return text.slice(start, end).trimEnd();
}

function replaceTestBlock(targetText, packagedText) {
  const start = targetText.indexOf(TEST_START);
  const end = targetText.indexOf(TEST_END, start + TEST_START.length);
  const newline = targetText.includes('\r\n') ? '\r\n' : '\n';
  const block = extractTestBlock(packagedText, 'Package test file').replace(/\r?\n/g, newline);
  const currentBlock = targetText.slice(start, end).trimEnd().replace(/\r\n/g, "\n");
  if (currentBlock === block.trimEnd().replace(/\r\n/g, "\n")) return { text: targetText, changed: false };
  const nextTest = targetText.slice(end);
  const result = `${targetText.slice(0, start)}${block}${newline}${newline}${nextTest}`;
  return { text: result, changed: result !== targetText };
}

function uniqueBackupPath(filePath) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  let candidate = `${filePath}.bak-${stamp}`;
  let suffix = 1;
  while (fs.existsSync(candidate)) candidate = `${filePath}.bak-${stamp}-${suffix++}`;
  return candidate;
}

function checkSyntax(contents, filePath) {
  try {
    new vm.Script(contents, { filename: filePath });
  } catch (error) {
    throw new Error(`Syntax validation failed for ${path.basename(filePath)}: ${error.message}`);
  }
}

function writeStage(targetPath, contents) {
  const stagePath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.codex-${process.pid}.tmp.js`);
  fs.writeFileSync(stagePath, contents, 'utf8');
  try {
    checkSyntax(contents, stagePath);
  } catch (error) {
    try { fs.unlinkSync(stagePath); } catch (_) {}
    throw error;
  }
  return stagePath;
}

function restoreBackups(backups) {
  for (const [targetPath, backupPath] of backups) {
    if (backupPath) fs.copyFileSync(backupPath, targetPath);
  }
}

function replaceWithStage(stagePath, targetPath) {
  const displacedPath = `${targetPath}.codex-displaced-${process.pid}`;
  if (fs.existsSync(displacedPath)) throw new Error(`Refusing to overwrite an existing temporary file: ${displacedPath}`);
  fs.renameSync(targetPath, displacedPath);
  try {
    fs.renameSync(stagePath, targetPath);
  } catch (error) {
    fs.renameSync(displacedPath, targetPath);
    throw error;
  }
  fs.unlinkSync(displacedPath);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = fs.realpathSync(options.repoRoot);
  const modulePath = path.join(repoRoot, 'Data', 'marion', 'runtime', 'marionCurrentTurnAuthority.js');
  const testPath = path.join(repoRoot, 'tests', 'runtime-authority.test.js');
  const packagedTestPath = path.join(__dirname, 'tests', 'runtime-authority.test.js');
  for (const filePath of [modulePath, testPath, packagedTestPath]) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`Required file is missing: ${filePath}`);
  }

  const moduleText = fs.readFileSync(modulePath, 'utf8');
  const packagedTestText = fs.readFileSync(packagedTestPath, 'utf8');
  const phaseA = applyExactPatch(moduleText, 'Phase A sanitizer', PHASE_A_OLD, PHASE_A_NEW, 'RUNTIME_AUTHORITY_PHASE_A_FAIL_CLOSED_V1');
  const phaseB = applyExactPatch(phaseA.text, 'Phase B sanitizer', PHASE_B_OLD, PHASE_B_NEW, 'RUNTIME_AUTHORITY_PHASE_B_FAIL_CLOSED_V1');
  const postGuard = appendPostGuard(phaseB.text);
  const test = replaceTestBlock(fs.readFileSync(testPath, 'utf8'), packagedTestText);
  const changes = [
    { target: modulePath, text: postGuard.text, changed: phaseA.changed || phaseB.changed || postGuard.changed },
    { target: testPath, text: test.text, changed: test.changed },
  ];
  const stages = [];

  try {
    for (const change of changes) stages.push({ ...change, stage: writeStage(change.target, change.text) });
    if (options.checkOnly) {
      console.log('Patch anchors and JavaScript syntax are valid. No files were changed.');
      return;
    }

    const backups = [];
    try {
      for (const change of stages) {
        if (change.changed) {
          const backup = uniqueBackupPath(change.target);
          fs.copyFileSync(change.target, backup, fs.constants.COPYFILE_EXCL);
          backups.push([change.target, backup]);
        }
      }
      for (const change of stages) {
        if (change.changed) replaceWithStage(change.stage, change.target);
      }

      checkSyntax(fs.readFileSync(modulePath, 'utf8'), modulePath);
      checkSyntax(fs.readFileSync(testPath, 'utf8'), testPath);
      if (!options.skipTest) {
        execFileSync(process.execPath, ['--test', `--test-name-pattern=${FOCUSED_TEST_PATTERN}`, path.relative(repoRoot, testPath)], { cwd: repoRoot, stdio: 'inherit' });
      }
      console.log('Runtime authority patch applied and validated.');
      if (options.skipTest) console.log('Focused runtime test was skipped by request.');
      for (const [, backup] of backups) console.log(`Backup: ${backup}`);
    } catch (error) {
      restoreBackups(backups);
      throw new Error(`Validation failed; original files were restored. ${error.message}`);
    }
  } finally {
    for (const stage of stages) {
      try { if (fs.existsSync(stage.stage)) fs.unlinkSync(stage.stage); } catch (_) {}
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}

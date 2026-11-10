'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const learningDir = path.join(root, 'Data/marion/runtime/learning');
const candidateFields = {
  proposalId:'marion_style_r24_test1234',scope:'response_style',baselineVersion:'composeMarionResponse.v9.5.r23',
  candidateVersion:'composeMarionResponse.v9.6.r24',datasetId:'marion.response-style.synthetic.v2',
  datasetVersion:'2.1.0',artifactRef:'composeMarionResponse.v9.6.r24',sampleCount:66
};
let actual = {};
const deps = {
  './MarionLearningPolicy': { MINIMUM_EVALUATION_SAMPLES: 1, MINIMUM_SCORE_LIFT: 0.01, MAXIMUM_REGRESSION:0 },
  './MarionLearningDataset': {validateEvaluationSet: () => ({ok:true,dataset:{datasetId:candidateFields.datasetId,version:'2.1.0',fixtureStore:'marion.fx.style.v2',caseIds:['case001']}})},
  './MarionLearningCandidate': {createCandidate: (input) => {
    actual.seen = input;
    if (actual.throwCandidate) throw new Error('PRIVATE RAW ERROR: secret');
    if (actual.rejectCandidate) return {ok:false,reason:actual.rejectCandidate};
    return {ok:true,candidate:{...input}};
  }}
};
function load(name, mocked) {
  const file = path.join(learningDir, name);
  const m = new Module(file, module);
  m.filename=file; m.paths=Module._nodeModulePaths(path.dirname(file));
  const nativeRequire=m.require.bind(m);
  m.require=(id) => Object.prototype.hasOwnProperty.call(mocked,id) ? mocked[id] : nativeRequire(id);
  m._compile(fs.readFileSync(file,'utf8'), file);
  return m.exports;
}
const evaluatorModule = load('MarionLearningEvaluator.js', deps);
const runtimeModule = load('MarionLearningRuntime.js', {});
const auth={ authenticated:true, role:'owner', verifiedBy:'server_middleware', actorId:'operator1' };
const manifest={datasetId:candidateFields.datasetId,version:'2.1.0',scope:'response_style'};
const registryRecord={status:'approved', ...manifest,fixtureStore:'marion.fx.style.v2',manifestHash:'a'.repeat(64),fixtureSetHash:'b'.repeat(64),caseIds:['case001']};
const evalInstance=evaluatorModule.createEvaluator({runVersion:async()=>{throw Error('not reached')},auditStore:{append:async()=>true}});
function createRuntime(evaluator=evalInstance) {
  return runtimeModule.createMarionLearningRuntime({
    signalAdapter:{record:async()=>({ok:false})},evaluator,
    approvalGate:{submitEvaluation:async()=>({ok:false}),decide:async()=>({ok:false})},
    manifestRegistry:{ listAvailable:async()=>({ok:true}),issueFixtureReview:async()=>({ok:false}),approveManifest:async()=>({ok:false}),
      revokeManifest:async()=>({ok:false}),listApproved:async()=>({ok:true}),
      selectApprovedManifest:async()=>({ok:true,manifest:{datasetId:candidateFields.datasetId,version:'2.1.0',scope:'response_style',fixtureStore:'marion.fx.style.v2',caseIds:['case001']},registration:registryRecord})},
    healthProbe:async()=>({ready:true}),offlineEvaluationReady:async()=>true,captureEnabled:false
  });
}
(async()=>{
  const runtime=createRuntime();
  actual.rejectCandidate='invalid_candidate_reference';
  delete process.env.SB_MARION_LEARNING_EVAL_DIAGNOSTICS;
  let result=await runtime.evaluateCandidate(candidateFields,manifest,auth);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {ok:false,reason:'candidate_validation_failed'});
  assert.deepEqual(Object.keys(actual.seen).sort(),Object.keys(candidateFields).sort());
  process.env.SB_MARION_LEARNING_EVAL_DIAGNOSTICS='true';
  result=await runtime.evaluateCandidate(candidateFields,manifest,auth);
  assert.equal(result.reason,'candidate_validation_failed');
  assert.equal(result.diagnosticStage,'candidate_validation');
  assert.equal(result.diagnosticCode,'invalid_candidate_reference');
  assert.equal(result.candidateFieldTypes.sampleCount,'number');
  assert.equal(result.candidateFieldTypes.datasetVersion,'string');
  assert.equal(JSON.stringify(result).includes('test1234'),false);
  assert.equal(JSON.stringify(result).includes('composeMarionResponse.v9'),false);
  actual.rejectCandidate='raw_unexpected_SECRET';
  result=await runtime.evaluateCandidate(candidateFields,manifest,auth);
  assert.equal(result.diagnosticCode,'unclassified_candidate_rejection');
  assert.equal(JSON.stringify(result).includes('SECRET'),false);
  actual.rejectCandidate=null;actual.throwCandidate=true;
  result=await runtime.evaluateCandidate(candidateFields,manifest,auth);
  assert.equal(result.diagnosticCode,'unclassified_candidate_rejection');
  assert.equal(JSON.stringify(result).includes('PRIVATE RAW'),false);
  actual.throwCandidate=false;
  result=await runtime.evaluateCandidate(candidateFields,manifest,{...auth,role:'guest'});
  assert.equal(result.reason,'owner_authentication_required');
  assert.equal(result.candidateFieldTypes,undefined);
  result=await runtime.evaluateCandidate(candidateFields,{datasetId:'bad'},auth);
  assert.equal(result.reason,'invalid_manifest_selection');
  assert.equal(result.candidateFieldTypes,undefined);
  assert.equal((await runtime.getPrivateHealth(auth)).liveActivationEnabled,false);
  assert.equal((await runtime.captureFinalOutcome({finalAccepted:true,learningConsent:true})).reason,'learning_disabled');
  // Synthetic successful evaluation pass-through must stay intact.
  let reached=false;
  const fakeEvaluator={evaluate:async()=>{reached=true; return {ok:true,report:{sampleCount:66},diagnostics:{replyParity:{comparedCaseCount:66,identicalReplyCount:33,differentReplyCount:33,normalization:'NFKC-whitespace-collapse',fingerprintsExposed:false}}}}};
  result=await createRuntime(fakeEvaluator).evaluateCandidate(candidateFields,manifest,auth);
  assert.equal(reached,true);
  assert.equal(result.ok,true);
  assert.equal(result.runtimeDiagnosticBoundary.replyParity,'available');
  // Execute real evaluator success path with a bounded synthetic one-case dataset.
  const audit=[];
  const runs=[];
  const fullEvaluator=evaluatorModule.createEvaluator({
    runVersion:async(version, ids, context)=>{
      runs.push({version,ids,mode:context.mode});
      const baseline=version===candidateFields.baselineVersion;
      return {
        completed:true,mode:'offline',version,scope:'response_style',caseCount:1,
        score:baseline ? 0.2 : 0.9,regressions:[],criticalFailures:[],
        caseScores:[{caseId:'case001',score:baseline?0.2:0.9,criticalFailure:false,replyFingerprint:baseline?'a'.repeat(64):'b'.repeat(64)}],
        diagnostics:{version:'marion.learningDiagnostics/1.0',complete:true,
          failedCaseCount:0,criticalFailureCaseCount:0,failedCheckCount:0,criticalCheckCount:0,
          omittedCaseCount:0,failedCases:[],failedCheckCounts:{},criticalCheckCounts:{}}
      };
    },
    auditStore:{append:async(entry)=>{audit.push(entry);return true;}}
  });
  const fullResult=await fullEvaluator.evaluate({...candidateFields,sampleCount:1},
    {datasetId:candidateFields.datasetId,version:'2.1.0',fixtureStore:'marion.fx.style.v2',caseIds:['case001']},
    registryRecord);
  assert.equal(fullResult.ok,true);
  assert.equal(fullResult.report.validated,true);
  assert.equal(fullResult.report.liveBehaviorChanged,false);
  assert.equal(fullResult.diagnostics.replyParity.differentReplyCount,1);
  assert.equal(audit.length,1);
  assert.equal(runs.length,2);
  assert.equal(runs[0].mode,'offline');
  assert.equal(JSON.stringify(audit).includes('replyFingerprint'),false);
  console.log('PASS: disabled diagnostics, safe reason, field types, no raw values, thrown validator, Owner gate, manifest gate, learning disabled, successful evaluation pass-through');
})().catch(err=>{console.error(err);process.exitCode=1});

"use strict";
const { buildThalonMarionAdvisoryBridge } = require("./ThalonMarionAdvisoryBridge");
const THALON_STRATEGIC_ASSESSMENT_LAYER_VERSION = "nyx.thalon.strategicAssessmentLayer/0.1";
function buildThalonStrategicAssessment(payload = {}, options = {}) {
  const advisory = buildThalonMarionAdvisoryBridge(payload, options);
  return {...advisory, version: THALON_STRATEGIC_ASSESSMENT_LAYER_VERSION, source:"ThalonStrategicAssessmentLayer"};
}
module.exports={THALON_STRATEGIC_ASSESSMENT_LAYER_VERSION, buildThalonStrategicAssessment, default:buildThalonStrategicAssessment};

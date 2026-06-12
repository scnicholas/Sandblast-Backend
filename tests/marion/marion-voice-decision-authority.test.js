"use strict";

const assert = require("assert");
const { evaluateMarionVoiceAuthorityDecision } = require("../../Data/marion/runtime/MarionVoiceDecisionAuthorityRouter.js");
const { INTENT_CLASSES, ACTION_RISK } = require("../../Data/marion/runtime/MarionVoiceIntentClasses.js");

let decision = evaluateMarionVoiceAuthorityDecision({
  intent: { intentClass: INTENT_CLASSES.STATUS_REQUEST, actionRisk: ACTION_RISK.NONE },
  identity: { authorized: false }
});
assert.strictEqual(decision.authority, "Marion");
assert.strictEqual(decision.publicAgent, "Nyx");
assert.strictEqual(decision.allowed, true);
assert.strictEqual(decision.decisionState, "status_allowed");

decision = evaluateMarionVoiceAuthorityDecision({
  intent: { intentClass: INTENT_CLASSES.ACTION_COMMAND, actionRisk: ACTION_RISK.STATE_CHANGING },
  identity: { authorized: false }
});
assert.strictEqual(decision.allowed, false);
assert.strictEqual(decision.reason, "ACTION_COMMAND_REQUIRES_ADMIN_AUTHORITY");

decision = evaluateMarionVoiceAuthorityDecision({
  intent: { intentClass: INTENT_CLASSES.ACTION_COMMAND, actionRisk: ACTION_RISK.DEPLOYMENT, requiresConfirmation: true },
  identity: { authorized: true }
});
assert.strictEqual(decision.allowed, false);
assert.strictEqual(decision.requiresConfirmation, true);
assert.strictEqual(decision.decisionState, "confirmation_required");

console.log("PASS marion-voice-decision-authority");

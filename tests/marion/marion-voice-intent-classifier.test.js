"use strict";

const assert = require("assert");
const { classifyMarionVoiceIntent } = require("../../Data/marion/runtime/MarionVoiceIntentClassifier.js");
const { INTENT_CLASSES, ACTION_RISK } = require("../../Data/marion/runtime/MarionVoiceIntentClasses.js");

let result = classifyMarionVoiceIntent({ transcript: "Nyx, give me the voice lane status." });
assert.strictEqual(result.intentClass, INTENT_CLASSES.STATUS_REQUEST);
assert.strictEqual(result.requiresAdmin, false);

result = classifyMarionVoiceIntent({ transcript: "Continue.", previousTopic: "cash flow" });
assert.strictEqual(result.intentClass, INTENT_CLASSES.FOLLOW_UP_QUERY);
assert.strictEqual(result.slots.topic, "cash flow");

result = classifyMarionVoiceIntent({ transcript: "Update the index.js with the patch." });
assert.strictEqual(result.intentClass, INTENT_CLASSES.ACTION_COMMAND);
assert.strictEqual(result.requiresAdmin, true);
assert.strictEqual(result.actionRisk, ACTION_RISK.STATE_CHANGING);

result = classifyMarionVoiceIntent({ transcript: "Deploy this to production." });
assert.strictEqual(result.intentClass, INTENT_CLASSES.ACTION_COMMAND);
assert.strictEqual(result.requiresConfirmation, true);
assert.strictEqual(result.actionRisk, ACTION_RISK.DEPLOYMENT);

result = classifyMarionVoiceIntent({ transcript: "Marion voice delivery should speak only to me." });
assert.strictEqual(result.intentClass, INTENT_CLASSES.ADMIN_VOICE_DELIVERY_REQUEST);
assert.strictEqual(result.requiresAdmin, true);

console.log("PASS marion-voice-intent-classifier");

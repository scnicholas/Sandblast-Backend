"use strict";

const assert = require("assert");
const finalRenderTelemetry = require("../Data/marion/runtime/finalRenderTelemetry.js");
const progressionPolicy = require("../Data/marion/runtime/progressionResponsePolicy.js");
const marionBridge = require("../Data/marion/runtime/marionBridge.js");
const composer = require("../Data/marion/runtime/composeMarionResponse.js");
const chatEngine = require("../Utils/chatEngine.js");

assert.strictEqual(typeof finalRenderTelemetry.enforceFinalProgressionReply, "function");
assert.strictEqual(typeof progressionPolicy.shapeProgressionReply, "function");
assert.ok(marionBridge);
assert.ok(composer);
assert.ok(chatEngine);

console.log("module load smoke passed");

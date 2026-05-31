"use strict";

const assert = require("assert");

const compose = require("../Data/marion/runtime/composeMarionResponse.js");
const bridge = require("../Data/marion/runtime/marionBridge.js");
const state = require("../Utils/stateSpine.js");
const shape = require("../Data/marion/runtime/progressionShape.js");
const memory = require("../Data/marion/runtime/progressionMemory.js");
const policy = require("../Data/marion/runtime/progressionResponsePolicy.js");
const telemetry = require("../Data/marion/runtime/progressionTelemetry.js");

assert(compose, "compose module should load");
assert(bridge, "bridge module should load");
assert(state, "state module should load");
assert.strictEqual(typeof shape.buildProgressionProfile, "function");
assert.strictEqual(typeof memory.updateProgressionMemory, "function");
assert.strictEqual(typeof policy.shapeProgressionReply, "function");
assert.strictEqual(typeof telemetry.buildProgressionTelemetry, "function");
assert.strictEqual(typeof state.normalizeProgressionRefinementCarry, "function");

console.log("progression module load smoke passed");

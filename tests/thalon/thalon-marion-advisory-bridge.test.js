"use strict";
const assert = require("assert");
const { buildThalonMarionAdvisoryBridge } = require("../../Data/marion/runtime/thalon/ThalonMarionAdvisoryBridge");
const packet = buildThalonMarionAdvisoryBridge({ text:"urgent strategic tradeoff with safety uncertainty" });
assert.strictEqual(packet.active, true);
assert.strictEqual(packet.strategicReviewRequired, true);
assert.strictEqual(packet.finalAuthority, "Marion");
assert.strictEqual(packet.finalAnswerAuthorized, false);

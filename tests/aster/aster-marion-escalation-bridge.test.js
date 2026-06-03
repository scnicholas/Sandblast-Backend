"use strict";
const assert = require("assert");
const { buildAsterMarionEscalationBridge } = require("../../Data/marion/runtime/aster/AsterMarionEscalationBridge");
const packet = buildAsterMarionEscalationBridge({ envelope:{ riskLevel:"high", requiresHumanReview:true } });
assert.strictEqual(packet.active, true);
assert.strictEqual(packet.escalationRecommended, true);
assert.strictEqual(packet.finalAuthority, "Marion");
assert.strictEqual(packet.finalAnswerAuthorized, false);

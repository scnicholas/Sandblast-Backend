"use strict";
const assert = require("assert");
const { buildLingoLinkMarionAuthorityBridge } = require("../../Data/marion/runtime/lingolink/LingoLinkMarionAuthorityBridge");
const packet = buildLingoLinkMarionAuthorityBridge({ text:"Bonjour", languageMeta:{detected:"fr"} });
assert.strictEqual(packet.active, true);
assert.strictEqual(packet.finalAuthority, "Marion");
assert.strictEqual(packet.finalAnswerAuthorized, false);
assert.strictEqual(packet.publicReplyVisible, false);

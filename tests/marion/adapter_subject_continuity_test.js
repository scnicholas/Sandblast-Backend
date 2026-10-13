"use strict";

const assert = require("assert");
const path = require("path");
const adapterPath = path.resolve(__dirname, "../../Data/marion/runtime/marionPrivateRuntimeAdapter.js");
const adapter = require(adapterPath);
const runtime = adapter._internal;

const subject = "the JavaScript routing file";
const unrelatedTechnicalReply = "The state mutation timing must be corrected before historical memory is merged.";
const alignedTechnicalReply = "The JavaScript routing file has a state mutation timing defect.";

assert.strictEqual(runtime.subjectAnchor("Do a surgical autopsy on the JavaScript routing file."), "JavaScript routing file");
assert.strictEqual(runtime.progressionReplyMismatch(unrelatedTechnicalReply, "technical", subject), true,
  "a broadly technical answer must still fail when it drops the short active subject");
assert.strictEqual(runtime.progressionReplyMismatch(alignedTechnicalReply, "technical", subject), false,
  "a technical answer that names the active subject remains acceptable");
assert.strictEqual(runtime.subjectReplyMismatch("A useful answer to this longer question.", "Explain how the JavaScript routing layer handles authentication before dispatch."), false,
  "long prompts are not treated as exact subject labels");

const fallback = runtime.recoveryReply("Go deeper.", "technical", { activeSubject: subject });
assert.match(runtime.anchorReplyToSubject(fallback, subject), /JavaScript routing file/i,
  "the bounded continuation recovery retains the active subject");
const unanchoredFallback = runtime.anchorReplyToSubject("Fix current-turn domain precedence first.", subject);
assert.match(unanchoredFallback, /^For JavaScript routing file:/i,
  "recovery replies that omit the active subject receive a short subject anchor");

console.log("[PASS] Adapter subject continuity: off-subject technical replies are rejected during short-topic follow-ups and recovery stays anchored.");

"use strict";

const assert = require("assert");
const compose = require("./composeMarionResponse.js");
const bridge = require("./marionBridge.js");

const c = compose._internal;
const b = bridge._internal;

assert.strictEqual(c.isFiveTurnContractTurn("Hi Nyx", { previousMemory: { fiveTurnContract: { active: true } } }, {}), false, "Greeting must not inherit stale five-turn/progression state");
assert.strictEqual(c.sanitizeUserFacingReply("Progression active: run next validation, then mark Passed or Failed.", "simple_chat", "Hi Nyx", {}), "", "Composer must strip workflow-state leak");
assert.strictEqual(c._missingThisShouldBeUndefined, undefined, "Sanity placeholder");

const phase = b.resolvePhaseAnchor("continue", { memoryText: "progression shaping refinement phase 2" });
assert.strictEqual(phase.resolved, false, "Bridge must not resolve stale phase from vague continuation alone");

const cleanPhase = b.resolvePhaseAnchor("continue the progression shaping phase 2 validation", { memoryText: "progression shaping refinement" });
assert.strictEqual(cleanPhase.resolved, true, "Bridge should still resolve explicit progression user intent");

const suppressed = b.enforceValidPublicReply({ reply: "Progression active: run next validation, then mark Passed or Failed." }, { normalized: { userQuery: "Hi Nyx" } });
assert.strictEqual(suppressed.emit, false, "Unsafe workflow-state reply must not emit");
assert.strictEqual(suppressed.suppressUserFacingReply, true, "Unsafe workflow-state reply must be silent");
assert.strictEqual(suppressed.reply, "", "Unsafe workflow-state reply must be blanked");

console.log("PASS: bridge/composer loop hardlock smoke checks passed");

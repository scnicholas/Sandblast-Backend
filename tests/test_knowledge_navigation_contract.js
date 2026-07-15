"use strict";
const assert = require("assert");
const path = require("path");
const root = path.resolve(__dirname, "..");
const concierge = require(path.join(root, "Data", "marion", "runtime", "DomainConcierge.js"));
const chatEngine = require(path.join(root, "Utils", "chatEngine.js"));

const publicBase = {
  audience: "public",
  lane: "public_interface",
  presentationProfile: "public",
  publicSurfaceOnly: true,
  publicIdentityLock: true
};

const legal = { ...publicBase, message: "What legal risks should a business consider?" };
const decision = concierge.buildNyxPublicKnowledgeDecision(legal);
assert(decision, "DomainConcierge did not classify the legal knowledge question");
assert.strictEqual(decision.routeType, "knowledge");
assert.strictEqual(decision.actionRequired, false);
assert.strictEqual(decision.validateAction, false);
assert.strictEqual(decision.answerOnly, true);
assert.strictEqual(decision.knowledgeDomain, "law");
assert.strictEqual(decision.stateSpinePatch.pendingActionValidation, false);

const fast = chatEngine.buildNyxPublicKnowledgeFastReply(legal);
assert(fast, "ChatEngine did not fast-path the legal knowledge question");
assert.strictEqual(fast.routeType, "knowledge");
assert.strictEqual(fast.actionRequired, false);
assert.strictEqual(fast.validateAction, false);
assert.strictEqual(fast.answerOnly, true);
assert(!fast.guideActionPlan, "Knowledge answer leaked a guideActionPlan");
assert(/contracts|employment|privacy/i.test(fast.reply), "Legal answer did not contain expected risk categories");

const repaired = chatEngine.projectNyxPublicKnowledgeAnswerOnly({
  reply: "That route is unavailable right now.",
  actionRequired: true,
  validateAction: true,
  guideActionPlan: { actions: [{ type: "navigate", target: "law" }] },
  payload: { actionRequired: true, validateAction: true, guideActions: [{ target: "law" }] }
}, legal);
assert.strictEqual(repaired.actionRequired, false);
assert.strictEqual(repaired.validateAction, false);
assert.strictEqual(repaired.routeType, "knowledge");
assert(!repaired.guideActionPlan);
assert(!repaired.payload.guideActions);
assert(!/route is unavailable/i.test(repaired.reply));

const navigation = { ...publicBase, message: "Open Sandblast TV" };
assert.strictEqual(concierge.classifyNyxPublicKnowledgeDomain(navigation), null);
assert.strictEqual(chatEngine.classifyNyxPublicKnowledgeRequest(navigation), null);

console.log("Nyx R4 module contract tests passed.");

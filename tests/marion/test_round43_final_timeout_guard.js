"use strict";
const assert = require("assert");
const path = require("path");
const root = path.resolve(__dirname, "..");
const guard = require(path.join(root, "Data/marion/runtime/marionRound43FinalTimeoutGuard.js"));
const composer = require(path.join(root, "Data/marion/runtime/composeMarionResponse.js"));
const envelope = require(path.join(root, "Data/marion/runtime/marionFinalEnvelope.js"));

const prompt = "Suppose Sandblast begins licensing media internationally while accepting advertising revenue. What legal and financial questions should be resolved before expanding internationally?";

let assertions = 0;
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function eq(a, b, message) { assert.strictEqual(a, b, message); assertions += 1; }

ok(guard.isLawFinancePrompt(prompt), "prompt not recognized");
ok(guard.buildReply().includes("Legal:"), "legal section missing");
ok(guard.buildReply().includes("Financial:"), "financial section missing");

const compose =
  typeof composer.composeMarionResponse === "function" ? composer.composeMarionResponse :
  typeof composer.compose === "function" ? composer.compose :
  typeof composer.run === "function" ? composer.run :
  composer.default;

ok(typeof compose === "function", "composer export missing");

const start = process.hrtime.bigint();
const result = compose({
  prompt,
  deliveryChannel: "marion_admin_interface",
  adminInterfaceScope: "marion_admin_conversation",
  directMarionAdminInterface: true,
  marionAdminConversation: true
});
const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

ok(result && typeof result === "object", "composer result missing");
eq(result.final, true, "final flag missing");
eq(result.canEmit, true, "canEmit missing");
eq(result.executionAuthorized, false, "execution lock missing");
eq(result.hardStopLayer, 28, "layer hard stop changed");
ok(result.reply.includes("internationally"), "reply incomplete");
ok(result.finalEnvelope && result.finalEnvelope.signature === "MARION_FINAL_AUTHORITY", "final signature missing");
ok(elapsedMs < 50, "bounded completion exceeded local budget");

const built = envelope.createMarionFinalEnvelope({ prompt });
ok(built && built.final === true, "envelope final missing");
ok(built && built.reply && built.reply.includes("qualified legal and tax review"), "envelope repair missing");
eq(built.executionAuthorized, false, "envelope execution lock missing");

console.log(JSON.stringify({
  ok: true,
  assertions,
  elapsedMs,
  version: guard.VERSION
}, null, 2));

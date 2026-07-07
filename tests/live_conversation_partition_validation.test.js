
"use strict";
const assert = require("assert");
const partition = require("../../Data/marion/runtime/liveConversationPartitionValidator.js");

function textOf(v) { return typeof v === "string" ? v : JSON.stringify(v); }
function noPublicLeaks(value) {
  const t = textOf(value);
  assert(!/\bMac\b/.test(t), "public output leaked Mac");
  assert(!/\bMarion\b/.test(t), "public output leaked Marion");
  assert(!/greeting lane|session patch|reply authority|final envelope|runtimeTelemetry|fallback|loop detected/i.test(t), "public output leaked runtime wording");
  assert(!/"authenticatedOperator"\s*:\s*true/i.test(t), "public output leaked authenticatedOperator true");
  assert(!/"operatorPersonalization"\s*:\s*true/i.test(t), "public output leaked operatorPersonalization true");
}

const publicCtx = {
  source: "sandblast_channel_widget",
  audience: "public",
  surfaceAgent: "nyx",
  publicSurfaceOnly: true,
  client: { site: "sandblast.channel" },
  sessionId: "same-session",
  text: "Are you with me?"
};

const spoofedPublic = {
  ...publicCtx,
  authenticatedOperator: true,
  operatorPersonalization: true,
  allowPersonalName: true,
  operatorName: "Mac"
};

const badPublicReply = {
  ok: true,
  reply: "I’m here. I’m steady and with the thread. I’ll keep the answer human, protective, and clean. Do you want to keep testing the greeting lane?",
  operatorName: "Mac",
  authenticatedOperator: true,
  operatorPersonalization: true,
  allowPersonalName: true,
  sessionId: "same-session"
};
const projectedPublic = partition.projectResult(badPublicReply, spoofedPublic);
assert.strictEqual(projectedPublic.partitionKind, "public");
assert.strictEqual(projectedPublic.publicSurfaceOnly, true);
assert.strictEqual(projectedPublic.surfaceAgent, "nyx");
assert.strictEqual(projectedPublic.audience, "public");
noPublicLeaks(projectedPublic);
assert(/Sandblast|radio|TV|media|AI|business tools/i.test(projectedPublic.reply), "public presence reply should be useful and generic");

const privateCtx = {
  route: "/api/marion/admin/conversation",
  source: "marion_admin_conversation",
  audience: "operator",
  surfaceAgent: "marion",
  serverSideAdminAuth: true,
  authenticatedOperator: true,
  operatorName: "Mac",
  sessionId: "same-session",
  text: "Marion, are you speaking to me?"
};
const privateReply = partition.projectResult({ reply: "I’m with you, Mac. We can continue the build.", sessionId: "same-session" }, privateCtx);
assert.strictEqual(privateReply.partitionKind, "operator");
assert.strictEqual(privateReply.surfaceAgent, "marion");
assert.strictEqual(privateReply.operatorPersonalization, true);
assert.strictEqual(privateReply.operatorName, "Mac");
assert(/Mac/.test(privateReply.reply), "private operator reply should allow Mac");

const pubKey = partition.sessionPartitionKey(publicCtx);
const opKey = partition.sessionPartitionKey(privateCtx);
assert.notStrictEqual(pubKey, opKey, "public and operator session partitions must not collide even with same raw sessionId");

const validation = partition.validateNoCrossPartitionLeak(badPublicReply, spoofedPublic);
assert.strictEqual(validation.ok, true);
console.log("phase3 live conversation partition validation ok");

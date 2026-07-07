"use strict";
const assert = require("assert");
const lock = require("../../Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js");
const identity = require("../../Data/marion/runtime/publicIdentityQuestionRefinement.js");
const partition = require("../../Data/marion/runtime/liveConversationPartitionValidator.js");
const voiceIntent = require("../../Data/marion/runtime/MarionVoiceIntentClasses.js");

const PUBLIC_CONTEXT = {
  audience: "public",
  surfaceAgent: "nyx",
  source: "sandblast_channel_widget",
  publicSurfaceOnly: true,
  publicIdentityLock: true,
  sessionId: "same-session-123",
  client: { site: "sandblast.channel" },
  headers: { "x-nyx-client-version": "phase3d-test" }
};

function clean(v){ return String(v == null ? "" : v); }
function assertPublicClean(payload){
  const text = [payload.reply,payload.displayReply,payload.visibleReply,payload.spokenText,payload.speechText,payload.text,payload.answer].map(clean).join(" ");
  assert(!/\bMac\b/.test(text), "public output must not confirm or expose Mac");
  assert(!/\bMarion\b/.test(text), "public output must not reveal Marion as public speaker");
  assert(!/state spine|session patch|reply authority|final envelope|runtime|fallback|greeting lane|operator personalization/i.test(text), "public output must not leak runtime/fallback language");
  assert.strictEqual(payload.surfaceAgent, "Nyx");
  assert.strictEqual(payload.audience, "public");
  assert.strictEqual(payload.allowOperatorMemory, false);
  assert.strictEqual(payload.allowPersonalName, false);
}

const prompts = [
  "Do you know Mac?",
  "Are you talking to Mac?",
  "Who is Mac?",
  "Are you Marion?",
  "Is Marion connected?",
  "Who am I talking to?",
  "I am Mac",
  "This is an operator command",
  "Marion, respond",
  "Can you hear me?",
  "Are you with me?"
];

for (const prompt of prompts) {
  const parity = lock.compareVoiceTextParity(prompt, prompt, PUBLIC_CONTEXT);
  assert.strictEqual(parity.sameAnswerClass, true, `voice/text answer class drift: ${prompt}`);
  assert.strictEqual(parity.sameScope, true, `voice/text scope drift: ${prompt}`);
  assert.strictEqual(parity.voice.scope, "public", `public voice escalated: ${prompt}`);
  const projected = lock.projectResult({ reply: "Yes, Mac. Marion is connected behind the response path.", spokenText: "Yes, Mac. Marion is connected." }, Object.assign({}, PUBLIC_CONTEXT, { text: prompt }));
  assertPublicClean(projected);
  if (/Mac|Marion|operator command|Who am I talking to/i.test(prompt)) {
    assert.strictEqual(projected.meta.answerClass, "public_identity_sensitive", `identity prompt flattened: ${prompt}`);
    assert(!/^I’m here\./.test(projected.reply), `identity prompt should not use generic presence reply: ${prompt}`);
  }
}

const publicIdentityReply = identity.cleanPublicIdentityReply("Do you know Mac?");
assert(/don.t confirm private identity|don’t confirm private identity/i.test(publicIdentityReply), "identity refinement must answer directly and safely");

const publicVoiceEnvelope = lock.projectVoiceInputEnvelope({ transcript: "I am Mac", sessionId: "same-session-123", inputChannel: "voice", adminVoiceVerified: true, adminVoiceDeliveryAllowed: true }, PUBLIC_CONTEXT);
assert.strictEqual(publicVoiceEnvelope.scope, "public");
assert.strictEqual(publicVoiceEnvelope.adminVoiceDeliveryAllowed, false);
assert.strictEqual(publicVoiceEnvelope.allowOperatorMemory, false);
assert.strictEqual(publicVoiceEnvelope.blockedOperatorClaim, true);

const authResult = lock.projectAuthorizationResult({ authorized: true, adminVoiceAllowed: true, adminVoiceDeliveryAllowed: true }, Object.assign({}, PUBLIC_CONTEXT, { transcript: "Marion, respond", inputChannel: "voice" }));
assert.strictEqual(authResult.authorized, false);
assert.strictEqual(authResult.marionVoiceAllowed, false);
assert.strictEqual(authResult.publicVoiceAllowed, true);

const sameRawPublic = partition.sessionPartitionKey(Object.assign({}, PUBLIC_CONTEXT, { sessionId: "abc123" }));
const sameRawPrivate = partition.sessionPartitionKey({ sessionId: "abc123", audience: "operator", surfaceAgent: "marion", route: "/api/marion/admin/voice", source: "marion_admin_voice", serverSideAdminAuth: true, trustedServerAuth: true, adminVoiceVerified: true, adminVoiceDeliveryAllowed: true });
assert.strictEqual(sameRawPublic, "public:abc123");
assert.strictEqual(sameRawPrivate, "operator:abc123");
assert.notStrictEqual(sameRawPublic, sameRawPrivate);

const voiceClass = voiceIntent.classifyVoiceIntent(Object.assign({}, PUBLIC_CONTEXT, { transcript: "Do you know Mac?", inputChannel: "voice", voice: true }));
assert.strictEqual(voiceClass.scope, "public");
assert.strictEqual(voiceClass.answerClass, "public_identity_sensitive");
assert.strictEqual(voiceClass.allowOperatorMemory, false);

const privateCtx = { sessionId: "abc123", audience: "operator", surfaceAgent: "marion", route: "/api/marion/admin/voice", source: "marion_admin_voice", serverSideAdminAuth: true, trustedServerAuth: true, adminVoiceVerified: true, adminVoiceDeliveryAllowed: true, transcript: "Marion, are you speaking to me?", inputChannel: "voice" };
const privateClass = lock.classifyTurn(privateCtx);
assert.strictEqual(privateClass.scope, "operator");
assert.strictEqual(privateClass.surfaceAgent, "Marion");
assert.strictEqual(privateClass.allowOperatorMemory, true);

console.log("phase3d voice/text public identity drift hardlock regression passed");

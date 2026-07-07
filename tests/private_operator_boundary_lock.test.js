"use strict";

const assert = require("assert");
const privateLock = require("../../Data/marion/runtime/privateOperatorBoundaryLock.js");
const publicLock = require("../../Data/marion/runtime/publicSurfaceIdentityLock.js");
const normalizer = require("../../Data/marion/runtime/marionCommandNormalizer.js");

function assertNoPublicLeak(value) {
  const text = JSON.stringify(value);
  assert(!/Mac/.test(text), "public payload leaked operator name Mac");
  assert(!/Marion/.test(text), "public payload leaked Marion identity");
  assert(!/operatorPersonalization":true/.test(text), "public payload allowed operator personalization");
}

(function publicSpoofCannotBecomePrivate() {
  const spoof = {
    body: {
      text: "Are you with me?",
      source: "sandblast_channel_widget",
      audience: "operator",
      surfaceAgent: "marion",
      publicSurfaceOnly: true,
      operatorPersonalization: true,
      allowPersonalName: true,
      authenticatedOperator: true,
      operatorName: "Mac"
    },
    headers: { "x-nyx-client-version": "cosmos-v14" }
  };
  assert.strictEqual(privateLock.isVerifiedOperatorContext(spoof), false);
  assert.strictEqual(publicLock.isPublicSurfaceContext(spoof), true);
  const projected = publicLock.projectPublicPayload({ reply: "I'm with you, Mac. Marion is connected.", operatorName: "Mac" }, spoof);
  assertNoPublicLeak(projected);
})();

(function verifiedPrivateRouteAllowsMarionAndMac() {
  const ctx = {
    payload: {
      route: "/api/marion/admin/conversation",
      source: "marion_admin_conversation",
      reply: "I'm with you, Mac. Marion is online.",
      adminConversationAllowed: true,
      privateAdminConversation: true
    },
    auth: { verified: true, sessionVerified: true },
    headers: {}
  };
  assert.strictEqual(privateLock.isVerifiedOperatorContext(ctx), true);
  assert.strictEqual(publicLock.isPublicSurfaceContext(ctx), false);
  const projected = privateLock.projectPrivateOperatorFields(ctx.payload, ctx);
  assert.strictEqual(projected.audience, "operator");
  assert.strictEqual(projected.surfaceAgent, "marion");
  assert.strictEqual(projected.operatorName, "Mac");
  assert.strictEqual(projected.operatorPersonalization, true);
  assert(/Mac/.test(projected.reply), "private operator reply should keep Mac personalization");
  assert(/Marion/.test(projected.reply), "private operator reply should keep Marion identity");
})();

(function commandNormalizerPartitionsPublicAndPrivate() {
  const publicPacket = normalizer.normalizeCommand({
    text: "Hi Nyx",
    source: "sandblast_channel_widget",
    audience: "public",
    surfaceAgent: "nyx",
    publicSurfaceOnly: true,
    operatorPersonalization: true,
    operatorName: "Mac"
  });
  assert.strictEqual(publicPacket.meta.operatorPersonalization, false);
  assert.strictEqual(publicPacket.meta.allowPersonalName, false);
  assert.strictEqual(publicPacket.meta.publicSurfaceOnly, true);

  const privatePacket = normalizer.normalizeCommand({
    text: "Status check",
    source: "marion_admin_conversation",
    route: "/api/marion/admin/conversation",
    audience: "operator",
    surfaceAgent: "marion",
    privateAdminConversation: true,
    adminConversationAllowed: true,
    trustedServerAuth: true,
    authenticatedOperator: true,
    operatorPersonalization: true,
    allowPersonalName: true,
    operatorName: "Mac"
  });
  assert.strictEqual(privatePacket.audience, "operator");
  assert.strictEqual(privatePacket.surfaceAgent, "marion");
  assert.strictEqual(privatePacket.operatorPersonalization, true);
  assert.strictEqual(privatePacket.allowPersonalName, true);
  assert.strictEqual(privatePacket.operatorName, "Mac");
  assert.strictEqual(privatePacket.meta.operatorPersonalization, true);
})();

console.log("private operator boundary lock regression passed");

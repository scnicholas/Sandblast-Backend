"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const composerPath = path.join(
  root,
  "Data",
  "marion",
  "runtime",
  "composeMarionResponse.js"
);
const safetyPath = path.join(
  root,
  "Data",
  "marion",
  "runtime",
  "marionAdminRuntimeSafety.js"
);
const bridgePath = path.join(
  root,
  "Data",
  "marion",
  "runtime",
  "marionBridge.js"
);

const composer = require(composerPath);
const safety = require(safetyPath);
const bridge = require(bridgePath);

async function main() {
  assert.strictEqual(
    typeof composer.marionPrivateRuntimeIdentityProjection,
    "function"
  );
  assert.strictEqual(
    typeof bridge.marionPrivateRuntimeIdentityProjection,
    "function"
  );
  assert.strictEqual(typeof safety.privateRuntimeIdentity, "function");
  assert.strictEqual(typeof safety.isPrivateRuntimeIdentity, "function");

  const composerSource = fs.readFileSync(composerPath, "utf8");
  assert.match(
    composerSource,
    /const MARION_COMPOSER_STABLE_EXPORTS = module\.exports;/
  );
  assert.match(
    composerSource,
    /Object\.assign\(MARION_COMPOSER_STABLE_EXPORTS,\{VERSION/
  );
  assert.doesNotMatch(
    composerSource,
    /module\.exports=\{VERSION,NYX_MARION_LOOP_GOVERNOR_VERSION/
  );
  assert.match(
    composerSource,
    /nyx\.voiceTextParity\/1\.1-final-reprojection/
  );

  const privateInput = {
    conversationId: "identity-stability",
    message: "Hi Marion",
    privateAdminConversation: true,
    marionAdminConversation: true,
    directMarionAdminInterface: true,
    adminInterfaceScope: "marion_admin_conversation",
    deliveryChannel: "marion_admin_interface",
    verified: true
  };

  const identity = composer.marionPrivateRuntimeIdentityProjection(
    privateInput,
    {},
    "trace-identity-stability"
  );
  assert.strictEqual(Object.isFrozen(identity), true);
  assert.strictEqual(
    safety.isPrivateRuntimeIdentity(identity),
    true
  );
  assert.strictEqual(identity.scope, "private_admin");
  assert.strictEqual(identity.audience, "owner");
  assert.strictEqual(identity.surfaceAgent, "Marion");
  assert.strictEqual(identity.publicSurfaceOnly, false);
  assert.strictEqual(identity.publicFallbackBlocked, true);
  assert.strictEqual(
    identity.memoryPartition,
    "private:admin:identity-stability"
  );

  const bridgeIdentity = bridge.marionPrivateRuntimeIdentityProjection(
    privateInput,
    { verified: true },
    "trace-identity-stability"
  );
  assert.strictEqual(
    bridgeIdentity.memoryPartition,
    "private:admin:identity-stability"
  );
  assert.strictEqual(bridgeIdentity.publicFallbackBlocked, true);

  const composed = await composer.composeMarionResponse(
    { intent: "simple_chat" },
    privateInput
  );
  assert.ok(composed && typeof composed === "object");
  assert.strictEqual(composed.scope, "private_admin");
  assert.strictEqual(composed.audience, "owner");
  assert.strictEqual(composed.surfaceAgent, "Marion");
  assert.strictEqual(composed.publicSurfaceOnly, false);
  assert.strictEqual(composed.publicFallbackBlocked, true);
  assert.strictEqual(
    composed.memoryPartition,
    "private:admin:identity-stability"
  );
  assert.strictEqual(composed.meta.scope, "private_admin");
  assert.strictEqual(composed.payload.scope, "private_admin");
  assert.strictEqual(composed.finalEnvelope.scope, "private_admin");
  assert.strictEqual(composed.spokenText, composed.reply);
  assert.strictEqual(composed.textSpeak, composed.reply);

  const publicResult = await composer.composeMarionResponse(
    { intent: "simple_chat" },
    {
      conversationId: "public-control",
      message: "Hello"
    }
  );
  assert.ok(publicResult && typeof publicResult === "object");
  assert.notStrictEqual(publicResult.scope, "private_admin");
  assert.notStrictEqual(publicResult.publicFallbackBlocked, true);
  assert.notStrictEqual(publicResult.memoryPartition, "private:admin:public-control");

  console.log("PASS marion private identity export stability");
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

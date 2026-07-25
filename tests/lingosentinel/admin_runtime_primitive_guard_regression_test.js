"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const safety = require(path.join(root, "Data/marion/runtime/marionAdminRuntimeSafety.js"));
const composer = require(path.join(root, "Data/marion/runtime/composeMarionResponse.js"));

function throwingPrimitiveObject() {
  return {
    [Symbol.toPrimitive]() { throw new TypeError("Cannot convert object to primitive value"); },
    toString() { throw new TypeError("unsafe_toString"); },
    valueOf() { throw new TypeError("unsafe_valueOf"); }
  };
}

function throwingGetterObject() {
  const value = {};
  Object.defineProperty(value, "reply", {
    enumerable: true,
    get() { throw new TypeError("unsafe_reply_getter"); }
  });
  value.visibleReply = "Private reply survived";
  return value;
}

async function main() {
  assert.match(safety.VERSION, /primitive-serialization-hardlock/);

  const evil = throwingPrimitiveObject();
  assert.doesNotThrow(() => safety.primitiveText(evil, ""));
  assert.strictEqual(safety.primitiveText(evil, ""), "");
  assert.strictEqual(safety.cleanText(evil, "fallback"), "fallback");

  const error = new TypeError("Cannot convert object to primitive value");
  assert.strictEqual(safety.errorText(error), "Cannot convert object to primitive value");

  const circular = { reply: "Safe reply", token: "must-not-leak" };
  circular.self = circular;
  const serialized = safety.safeSerializable(circular);
  assert.strictEqual(serialized.reply, "Safe reply");
  assert.strictEqual(serialized.token, "[redacted]");
  assert.strictEqual(serialized.self, "[circular]");

  const getterSerialized = safety.safeSerializable(throwingGetterObject());
  assert.strictEqual(getterSerialized.reply, "[unreadable]");
  assert.strictEqual(getterSerialized.visibleReply, "Private reply survived");

  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  assert.doesNotThrow(() => safety.safeSerializable(revocable.proxy));
  assert.strictEqual(safety.safeSerializable(revocable.proxy), "[unreadable]");

  const identity = safety.privateRuntimeIdentity(
    { conversationId: "local-test-regression" },
    { verified: true },
    "trace-regression"
  );
  assert.strictEqual(identity.scope, "private_admin");
  assert.strictEqual(identity.audience, "owner");
  assert.strictEqual(identity.surfaceAgent, "Marion");
  assert.strictEqual(identity.publicSurfaceOnly, false);
  assert.strictEqual(identity.publicFallbackBlocked, true);
  assert.strictEqual(identity.memoryPartition, "private:admin:local-test-regression");

  assert.strictEqual(typeof composer.composeMarionResponse, "function");
  assert.strictEqual(typeof composer.marionPrivateRuntimeIdentityProjection, "function");

  const input = {
    prompt: evil,
    message: "Hi Marion",
    privateAdminConversation: true,
    marionAdminConversation: true,
    directMarionAdminInterface: true,
    adminInterfaceScope: "marion_admin_conversation",
    deliveryChannel: "marion_admin_interface",
    conversationId: "local-test-regression",
    verified: true
  };

  let composed;
  await assert.doesNotReject(async () => {
    composed = await composer.composeMarionResponse({ intent: "simple_chat" }, input);
  });
  assert.ok(composed && typeof composed === "object");
  assert.strictEqual(typeof composed.reply, "string");
  assert.ok(composed.reply.trim().length > 0);
  assert.strictEqual(composed.scope, "private_admin");
  assert.strictEqual(composed.audience, "owner");
  assert.strictEqual(composed.surfaceAgent, "Marion");
  assert.strictEqual(composed.publicSurfaceOnly, false);
  assert.strictEqual(composed.publicFallbackBlocked, true);
  assert.strictEqual(composed.memoryPartition, "private:admin:local-test-regression");
  assert.strictEqual(composed.meta.scope, "private_admin");

  const indexSource = fs.readFileSync(path.join(root, "index.js"), "utf8");
  assert.match(indexSource, /marion\.adminTextRuntimeHandler\/2\.0-private-primitive-serialization-hardlock/);
  assert.match(indexSource, /function marionAdminTextRuntimeExtractPrompt\(body\)[\s\S]*?marionAdminRuntimeFirstText/);
  assert.match(indexSource, /function marionAdminTextRuntimeReplyFromPacket\([\s\S]*?marionAdminRuntimeStrictText\(value/);
  assert.match(indexSource, /result:\s*marionAdminConsoleRedacted\(packet\)/);
  assert.match(indexSource, /app\.get\(MARION_ADMIN_TEXT_RUNTIME_ROUTES,[\s\S]*?status\(405\)/);
  assert.match(indexSource, /scope:\s*"private_admin"/);
  assert.match(indexSource, /publicFallbackBlocked:\s*true/);
  assert.doesNotMatch(indexSource, /result:\s*packet,\s*\n\s*bridgeStatus/);

  console.log("PASS marion admin runtime primitive guard regression");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

"use strict";
const assert = require("assert");
const gateway = require("../Data/marion/runtime/MarionAdminConsoleGateway.js");
(async () => {
  assert.strictEqual(typeof gateway.handleMarionAdminTextRuntime, "function");
  const result = await gateway.handleMarionAdminTextRuntime(
    { text: "What is 2 + 2?", adminVerified: true, sessionVerified: true },
    { adminVerified: true, sessionVerified: true }
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.scope, "private_admin");
  assert.strictEqual(result.surfaceAgent, "Marion");
  assert.strictEqual(result.reply, "4.");
  assert.strictEqual(result.publicFallbackBlocked, true);
  assert.ok(!/i(?:'|’)?m here|still with you/i.test(result.reply));
  console.log("PASS Marion private runtime route contract");
})().catch((err) => { console.error(err); process.exit(1); });

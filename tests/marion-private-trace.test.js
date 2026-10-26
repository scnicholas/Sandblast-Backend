"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const idx = fs.readFileSync(path.join(root, "index.js"), "utf8");
const adapter = require(path.join(root, "Data/marion/runtime/marionPrivateRuntimeAdapter.js"));
const internals = adapter._internal;
const prompt = "Marion, evaluate strategic advantages and risks of migrating Sandblast Radio from BR Logic to our own streaming infrastructure. Identify three priorities and recommend an implementation sequence.";
test("business request stays in business domain", () => assert.equal(internals.classifyExpectedDomain(prompt, {activeDomain:"technical"}), "business"));
test("development fallback is recognised", () => assert.equal(internals.wrongTaskReply("I have the thread. Give me the exact file or prompt target and I will keep the next update surgical.",prompt),true));
test("private adapter rejects unverified request", async () => {
  const res = await adapter.invokePrivateRuntime({prompt});
  assert.equal(res.ok, false); assert.equal(res.statusCode,401);
});
test("index is tracing actual direct bridge invocation", () => {
 assert.match(idx,/marionPrivateRuntimeTrace\(traceId, "before_bridge"/);
 assert.match(idx,/marionPrivateRuntimeTrace\(traceId, "after_bridge"/);
 assert.match(idx,/marionPrivateRuntimeTrace\(traceId, "after_reply_selection"/);
});
test("diagnostics do not print raw prompt or reply", () => {
 const traceSection=idx.slice(idx.indexOf("function marionPrivateRuntimeTrace("),idx.indexOf("async function invokeMarionAdminTextRuntime("));
 assert.ok(!/console\.info\([^)]*prompt/.test(traceSection));
 assert.ok(!/console\.info\([^)]*reply/.test(traceSection));
});

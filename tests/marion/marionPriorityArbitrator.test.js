"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadRuntime(name) {
  for (const p of [
    path.join(process.cwd(), "Data", "marion", "runtime", name),
    path.join(process.cwd(), "src", "marion", "strategy", name)
  ]) { try { return require(p); } catch (e) { if (!e || e.code !== "MODULE_NOT_FOUND") throw e; } }
  throw new Error(`Missing Layer 27 runtime module ${name}`);
}
function fn(api) {
  if (typeof api === "function") return api;
  for (const k of ["arbitrate", "rank", "prioritize", "run"]) if (api && typeof api[k] === "function") return api[k].bind(api);
  throw new TypeError("Priority arbitrator has no supported callable export");
}

test("Layer 27 priority arbitration ranks safety and architecture preservation above feature expansion", async () => {
  const api = loadRuntime("marionPriorityArbitrator.js");
  const arbitrate = fn(api);
  const out = await arbitrate({ candidates: [
    { id: "feature", label: "Add opportunity detection", urgency: 0.8, value: 0.9 },
    { id: "repair", label: "Prevent recursive reflection loop", urgency: 1, risk: 1, blocker: true },
    { id: "compat", label: "Preserve Layers 1 through 26 contracts", urgency: 0.95, dependency: true }
  ], policy: { safetyFirst: true, architectureFirst: true, executionAuthorized: false } });
  assert.ok(out && typeof out === "object");
  const ranked = out.ranked || out.priorities || out.items;
  assert.ok(Array.isArray(ranked) && ranked.length >= 3);
  const firstId = ranked[0] && (ranked[0].id || ranked[0].key);
  assert.ok(["repair", "compat"].includes(firstId), `unexpected first priority: ${firstId}`);
  assert.equal(out.executionAuthorized, false);
  assert.ok(new Set(ranked.map(x => x.id || x.key)).size === ranked.length, "priorities must be deduplicated");
});

test("Layer 27 priority arbitration is deterministic for equivalent input", async () => {
  const api = loadRuntime("marionPriorityArbitrator.js");
  const arbitrate = fn(api);
  const input = { candidates: [
    { id: "a", urgency: 0.5, value: 0.5 },
    { id: "b", urgency: 0.5, value: 0.5 }
  ], tieBreaker: "stable_input_order" };
  const a = await arbitrate(input);
  const b = await arbitrate(input);
  assert.deepEqual(a.ranked || a.priorities || a.items, b.ranked || b.priorities || b.items);
});

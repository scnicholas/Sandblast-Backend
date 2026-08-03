"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "index.js"), "utf8");

const startMarker = "/* OPERATIONAL_RESPONSE_PROJECTION_BOUNDARY_V5_START";
const endMarker = "/* OPERATIONAL_RESPONSE_PROJECTION_BOUNDARY_V5_END */";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

assert.ok(start >= 0, "Operational boundary V5 start marker missing.");
assert.ok(end > start, "Operational boundary V5 end marker missing.");

const block = source.slice(start, end + endMarker.length) + `
module.exports.__test = {
  normalizeOperationalResponsePathV5,
  isNyxOperationalHealthResponseV1,
  isNyxOperationalVoiceResponseV2,
  isNyxEcosystemOperationalResponseV1,
  isSandblastTvOperationalResponseV2
};`;

const context = {
  app: { locals: {} },
  module: { exports: {} },
  console
};
vm.createContext(context);
vm.runInContext(block, context, {
  filename: "operational-response-projection-boundary-v5.js"
});

const api = context.module.exports.__test;
assert.ok(api);

for (const route of [
  "/api/nyx/voice",
  "/nyx/voice",
  "/api/tts",
  "/tts"
]) {
  assert.strictEqual(
    api.isNyxOperationalVoiceResponseV2({ originalUrl: route }),
    true,
    `Voice route not isolated: ${route}`
  );
  assert.strictEqual(
    api.isNyxOperationalVoiceResponseV2({
      originalUrl: route.toUpperCase() + "/?returnJson=true"
    }),
    true,
    `Normalized voice route not isolated: ${route}`
  );
  assert.strictEqual(
    api.isSandblastTvOperationalResponseV2({ originalUrl: route }),
    true
  );
}

for (const route of [
  "/api/nyx/voice/health",
  "/nyx/voice/health",
  "/api/tts/health",
  "/tts/health",
  "/api/nyx/guide/health"
]) {
  assert.strictEqual(
    api.isNyxOperationalHealthResponseV1({ originalUrl: route }),
    true,
    `Health route not isolated: ${route}`
  );
}

for (const route of [
  "/api/chat",
  "/chat",
  "/api/marion/admin",
  "/api/nyx/voice/transcript"
]) {
  assert.strictEqual(
    api.isSandblastTvOperationalResponseV2({ originalUrl: route }),
    false,
    `Conversation route was over-bypassed: ${route}`
  );
}

assert.ok(source.includes('"utils/chatEngine.js"'));
assert.ok(source.includes('"utils/stateSpine.js"'));
assert.ok(source.includes('load("./utils/chatEngine.js")'));
assert.ok(source.includes('load("./utils/stateSpine.js")'));
assert.ok(!source.includes('load("./Utils/chatEngine.js")'));
assert.ok(!source.includes('load("./Utils/stateSpine.js")'));

console.log("INDEX VOICE OPERATIONAL BOUNDARY REGRESSION: PASS");

"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const indexPath = path.resolve(__dirname, "..", "index.js");
const source = fs.readFileSync(indexPath, "utf8");

assert(!source.includes("<<<<<<<"), "Conflict marker found.");
assert(!source.includes("======="), "Conflict marker found.");
assert(!source.includes(">>>>>>>"), "Conflict marker found.");

assert(
  source.includes("NYX-VOICE-OPERATIONAL-HEALTH-ISOLATION-V1"),
  "Top-level repair marker missing."
);
assert(
  source.includes("OPERATIONAL_RESPONSE_PROJECTION_BOUNDARY_V4_START"),
  "Operational boundary V4 missing."
);
assert(
  source.includes('voice: "/api/nyx/voice"'),
  "Canonical Nyx voice metadata missing."
);
assert(
  source.includes('voiceHealth: "/api/nyx/voice/health"'),
  "Canonical Nyx voice-health metadata missing."
);
assert(
  !source.includes('voice: "/api/voice"'),
  "Stale /api/voice metadata remains."
);

const narrowGuard =
  "if (isNyxEcosystemOperationalResponseV1(this && this.req))";
assert(
  !source.includes(narrowGuard),
  "A narrow prototype projector bypass remains."
);

const generalizedGuard =
  "if (isSandblastTvOperationalResponseV2(this && this.req))";
const guardCount = source.split(generalizedGuard).length - 1;
assert(
  guardCount >= 12,
  `Expected at least 12 generalized projector guards; found ${guardCount}.`
);

const startMarker =
  "/* OPERATIONAL_RESPONSE_PROJECTION_BOUNDARY_V4_START";
const endMarker =
  "/* OPERATIONAL_RESPONSE_PROJECTION_BOUNDARY_V4_END */";

const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
assert(start >= 0 && end > start, "Unable to extract V4 boundary.");

const block =
  source.slice(start, end + endMarker.length) +
  `
module.exports.__boundaryTest = {
  normalizeOperationalResponsePathV4,
  isNyxOperationalHealthResponseV1,
  isNyxEcosystemOperationalResponseV1,
  isSandblastTvOperationalResponseV2
};`;

const context = {
  app: { locals: {} },
  module: { exports: {} },
  console
};
vm.createContext(context);
vm.runInContext(block, context, { filename: "operational-boundary-v4.js" });

const api = context.module.exports.__boundaryTest;
assert(api, "Boundary test API was not exposed.");

const protectedPaths = [
  "/api/nyx/voice/health",
  "/nyx/voice/health",
  "/api/tts/health",
  "/tts/health",
  "/api/nyx/voice/transcript/health",
  "/nyx/voice/transcript/health",
  "/api/nyx/guide/health",
  "/nyx/guide/health",
  "/api/nyx/guide/release/health",
  "/nyx/guide/release/health"
];

for (const route of protectedPaths) {
  assert.strictEqual(
    api.isNyxOperationalHealthResponseV1({ originalUrl: route }),
    true,
    `Protected route not recognized: ${route}`
  );
  assert.strictEqual(
    api.isSandblastTvOperationalResponseV2({
      originalUrl: route.toUpperCase() + "/?probe=1"
    }),
    true,
    `Normalized protected route not recognized: ${route}`
  );
}

assert.strictEqual(
  api.isSandblastTvOperationalResponseV2({
    originalUrl: "/api/nyx/ecosystem/status"
  }),
  true
);
assert.strictEqual(
  api.isSandblastTvOperationalResponseV2({
    originalUrl: "/api/sandblast-tv/v1/health"
  }),
  true
);

for (const route of [
  "/api/chat",
  "/chat",
  "/api/nyx/voice",
  "/health",
  "/api/marion/admin"
]) {
  assert.strictEqual(
    api.isSandblastTvOperationalResponseV2({ originalUrl: route }),
    false,
    `Conversation/non-operational route was over-bypassed: ${route}`
  );
}

const earlyMount = source.indexOf(
  "NYX_VOICE_UTILS_EARLY_MOUNT_HARDLOCK_V1_START"
);
const finalNotFound = source.indexOf(
  'return res.status(404).json({ ok: false, error: "not_found", path: req.path'
);
assert(earlyMount >= 0, "Early voice mount missing.");
assert(finalNotFound >= 0, "Final not_found guard missing.");
assert(
  earlyMount < finalNotFound,
  "Canonical voice mount no longer precedes final not_found."
);

console.log("INDEX OPERATIONAL-HEALTH ISOLATION REGRESSION: PASS");

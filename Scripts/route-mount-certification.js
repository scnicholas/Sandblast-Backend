"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

process.env.RESEMBLE_API_TOKEN = process.env.RESEMBLE_API_TOKEN || "test-token";
process.env.RESEMBLE_VOICE_UUID = process.env.RESEMBLE_VOICE_UUID || "83e8335f";
process.env.SB_TTS_LOG_ENABLED = "false";

const BACKEND_ROOT = path.resolve(__dirname, "..");
const MOUNT_CANDIDATES = Object.freeze([
  path.join(BACKEND_ROOT, "Utils", "nyxVoiceMount.js"),
  path.join(BACKEND_ROOT, "utils", "nyxVoiceMount.js")
]);

function resolveMountPath() {
  const found = MOUNT_CANDIDATES.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch (_) {
      return false;
    }
  });

  assert.ok(
    found,
    ["Unable to locate nyxVoiceMount.js.", "Checked:", ...MOUNT_CANDIDATES.map((p) => `- ${p}`)].join("\n")
  );
  return found;
}

function resolveMountExport(mod) {
  const mount =
    typeof mod === "function" ? mod :
    mod && typeof mod.mountNyxVoice === "function" ? mod.mountNyxVoice :
    mod && typeof mod.mount === "function" ? mod.mount :
    mod && typeof mod.default === "function" ? mod.default :
    null;

  assert.strictEqual(
    typeof mount,
    "function",
    "nyxVoiceMount.js must export a callable mount function."
  );
  return mount;
}

const mounted = [];
const app = {
  locals: {},
  get(routePath, handler) { mounted.push(["GET", routePath, handler]); return this; },
  post(routePath, handler) { mounted.push(["POST", routePath, handler]); return this; },
  options(routePath, handler) { mounted.push(["OPTIONS", routePath, handler]); return this; }
};

const mountPath = resolveMountPath();
const mount = resolveMountExport(require(mountPath));

assert.doesNotThrow(() => {
  mount(app);
  mount(app);
}, "nyxVoiceMount must tolerate repeated mounting.");

const expectedRoutes = Object.freeze([
  "GET /api/tts",
  "POST /api/tts",
  "OPTIONS /api/tts",
  "GET /tts",
  "POST /tts",
  "OPTIONS /tts",
  "GET /api/tts/health"
]);

const pairs = mounted.map(([method, routePath]) => `${method} ${routePath}`);
const uniquePairs = new Set(pairs);

for (const expected of expectedRoutes) {
  assert.ok(uniquePairs.has(expected), `Missing ${expected}`);
  assert.strictEqual(
    pairs.filter((pair) => pair === expected).length,
    1,
    `Route mounted more than once: ${expected}`
  );
}

assert.strictEqual(
  mounted.length,
  expectedRoutes.length,
  `Mount must be idempotent and expose exactly ${expectedRoutes.length} routes.`
);
assert.strictEqual(uniquePairs.size, expectedRoutes.length, "Duplicate route registrations detected.");

for (const [method, routePath, handler] of mounted) {
  assert.strictEqual(
    typeof handler,
    "function",
    `Handler must be a function for ${method} ${routePath}`
  );
}

console.log(JSON.stringify({
  ok: true,
  certification: "nyx-route-mount",
  mountPath,
  routes: pairs,
  routeCount: mounted.length,
  idempotent: true,
  handlersValid: true
}, null, 2));

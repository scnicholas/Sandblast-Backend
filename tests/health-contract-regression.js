"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "nyx-health-contract-"));
const utils = path.join(temp, "utils");
fs.mkdirSync(utils, { recursive: true });

for (const name of ["nyxVoiceMount.js", "voiceRoute.js"]) {
  fs.copyFileSync(path.join(root, "utils", name), path.join(utils, name));
}

fs.writeFileSync(
  path.join(utils, "tts.js"),
  `"use strict";
async function health() {
  return {
    ok: true,
    enabled: true,
    ready: true,
    provider: "resemble",
    transportMode: "compat-first",
    voiceConfigured: true,
    tokenConfigured: true,
    directReply: "LEAK",
    publicReply: "LEAK",
    memoryPartition: "LEAK",
    voiceTextParity: { reply: "LEAK" },
    payload: { directReply: "LEAK" },
    privateData: { secret: "LEAK" }
  };
}
async function handleTts(_req, res) {
  if (res && typeof res.status === "function") {
    return res.status(200).json({ ok: true });
  }
  return { ok: true, audioUrl: "https://example.invalid/audio.mp3" };
}
module.exports = handleTts;
module.exports.handleTts = handleTts;
module.exports.health = health;
`,
  "utf8"
);

process.env.RESEMBLE_VOICE_UUID = "test-voice";

const forbidden = new Set([
  "directReply",
  "publicReply",
  "visibleReply",
  "reply",
  "spokenText",
  "payload",
  "memoryPartition",
  "partitionKey",
  "voiceTextParity",
  "answerClass",
  "privateData"
]);

function inspect(value, current = "$") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert(!forbidden.has(key), `Forbidden key: ${current}.${key}`);
    inspect(child, `${current}.${key}`);
  }
}

(async () => {
  const voiceRoute = require(path.join(utils, "voiceRoute.js"));
  const direct = await voiceRoute.health();

  inspect(direct);
  assert.strictEqual(direct.ok, true);
  assert.strictEqual(direct.service, "nyx-voice");
  assert.strictEqual(
    direct.healthContract,
    "nyx.voice.health/1.0-strict-allowlist"
  );
  assert.strictEqual(direct.moduleRoot, "utils");
  assert.strictEqual(direct.pathHardlock, true);

  const routes = [];
  const app = {
    locals: {},
    get(route, handler) {
      routes.push({ method: "GET", route, handler });
      return this;
    },
    post(route, handler) {
      routes.push({ method: "POST", route, handler });
      return this;
    },
    options(route, handler) {
      routes.push({ method: "OPTIONS", route, handler });
      return this;
    }
  };

  const mount = require(path.join(utils, "nyxVoiceMount.js"));
  mount(app, {
    compatibilityTtsRoutes: false,
    compatibilityHealthRoutes: false
  });

  const entry = routes.find(
    (item) =>
      item.method === "GET" &&
      item.route === "/api/nyx/voice/health"
  );
  assert(entry, "Canonical health route was not registered.");

  const output = { statusCode: 0, headers: {}, body: null };
  const res = {
    setHeader(key, value) {
      output.headers[String(key).toLowerCase()] = value;
    },
    status(code) {
      output.statusCode = code;
      return this;
    },
    json(value) {
      output.body = value;
      return this;
    }
  };

  await entry.handler({}, res);

  assert.strictEqual(output.statusCode, 200);
  assert.strictEqual(output.body.ok, true);
  assert.strictEqual(output.body.service, "nyx-voice");
  assert.strictEqual(output.body.moduleRoot, "utils");
  assert.strictEqual(output.body.pathHardlock, true);
  assert.strictEqual(
    output.headers["x-sb-nyx-voice-health-contract"],
    "nyx.voice.health/1.0-strict-allowlist"
  );
  inspect(output.body);

  console.log("NYX VOICE HEALTH CONTRACT REGRESSION: PASS");
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});

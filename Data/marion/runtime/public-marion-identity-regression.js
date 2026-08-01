"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = __dirname;
const expected = "Marion is Sandblast’s private cognitive coordination layer. She supports deeper reasoning, context continuity, routing, and response shaping behind the scenes, while I remain Nyx, the public-facing Sandblast assistant. Private operator functions and owner-only information are not exposed through this interface.";

const BACKEND_ROOT = path.resolve(ROOT, "..", "..", "..");
const CHAT_ENGINE_PATH = path.join(BACKEND_ROOT, "utils", "chatEngine.js");
const COMPOSER_PATH = path.join(ROOT, "composeMarionResponse.js");
const ROUTER_PATH = path.join(ROOT, "marionIntentRouter.js");

for (const filePath of [CHAT_ENGINE_PATH, COMPOSER_PATH, ROUTER_PATH]) {
  assert.ok(fs.existsSync(filePath), `Required file missing: ${filePath}`);
}

const chat = fs.readFileSync(CHAT_ENGINE_PATH, "utf8");
const composer = fs.readFileSync(COMPOSER_PATH, "utf8");
const router = fs.readFileSync(ROUTER_PATH, "utf8");

assert.ok(chat.includes("public_marion_identity"), "chatEngine public Marion identity route missing");
assert.ok(chat.includes(expected), "chatEngine public-safe Marion answer missing");
assert.ok(composer.includes(expected), "composer public-safe Marion answer missing");
assert.ok(router.includes("public_marion_identity_terms"), "router Marion identity reason missing");
assert.ok(router.includes("public_marion_identity"), "router Marion identity sub-intent missing");

assert.ok(!expected.includes("owner name"), "reply must not contain owner-only data");
assert.ok(/private cognitive coordination layer/i.test(expected));
assert.ok(/Nyx, the public-facing Sandblast assistant/i.test(expected));
assert.ok(/not exposed through this interface/i.test(expected));

console.log("PASS public Marion identity cohesion regression");
console.log(`chatEngine: ${CHAT_ENGINE_PATH}`);
console.log(`composer: ${COMPOSER_PATH}`);
console.log(`router: ${ROUTER_PATH}`);

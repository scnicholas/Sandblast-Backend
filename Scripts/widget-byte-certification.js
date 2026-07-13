"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "public", "sandblast_nyx_widget.html");
const html = fs.readFileSync(file, "utf8");
const bytes = Buffer.byteLength(html, "utf8");

assert.ok(bytes <= 49999, `Widget exceeds 49,999-byte ceiling: ${bytes}`);
assert.ok(html.startsWith("<!doctype html>"));
assert.ok(html.includes("SB_NYX_CONVERSATION_ENDPOINT"));
assert.ok(html.includes("SB_NYX_TTS_ENDPOINT"));
assert.ok(html.includes("nyx:voice:"));
assert.ok(html.includes("ve('prestart')"));
assert.ok(html.includes("ve('start')"));
assert.ok(html.includes("ve('end')"));
assert.ok(html.includes("output_format=mp3"));
assert.ok(html.includes("u.replace('/api/tts','/tts')"));
assert.ok(html.includes("a.src=x"));

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
assert.strictEqual(scripts.length, 3);
for (const source of scripts) new Function(source);

console.log(JSON.stringify({
  ok: true,
  file: path.basename(file),
  bytes,
  ceiling: 49999,
  remaining: 49999 - bytes,
  scripts: scripts.length
}, null, 2));

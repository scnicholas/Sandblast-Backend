#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const base = __dirname;
const required = [
  "index.js",
  "composeMarionResponse.js",
  "MarionAdminConsoleGateway.js",
  "marionBridge.js",
  "marionFinalEnvelope.js",
  "MarionAdminConsole.html"
];
for (const f of required) {
  const p = path.join(base, f);
  if (!fs.existsSync(p)) throw new Error("Missing " + f);
  const txt = fs.readFileSync(p, "utf8");
  if (f.endsWith(".js") && !txt.includes("MARION_TONE_NATURALIZATION_R15_START")) {
    throw new Error("Missing R15 block in " + f);
  }
}
const html = fs.readFileSync(path.join(base, "MarionAdminConsole.html"), "utf8");
const bytes = Buffer.byteLength(html, "utf8");
if (bytes > 49999) throw new Error("HTML exceeds 49999 bytes: " + bytes);
const forbidden = [
  "Runtime text console ready",
  "Short-lived admin session is active",
  "MASTER TOKEN CLEARED",
  "Warm, direct, and protective",
  "I’ve got the thread"
];
for (const s of forbidden) {
  if (html.includes(s)) throw new Error("Forbidden visible phrase remains: " + s);
}
console.log("PASS R15 tone naturalization smoke test");

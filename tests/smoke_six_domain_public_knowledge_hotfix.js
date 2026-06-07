"use strict";
const fs = require("fs");
const path = require("path");
const RUNTIME_DIR = path.join(__dirname, "marion", "runtime");
const bridge = require(path.join(RUNTIME_DIR, "marionBridge.js"));
const composer = require(path.join(RUNTIME_DIR, "composeMarionResponse.js"));
require(path.join(RUNTIME_DIR, "marionDomainRegistry.js"));
const widgetPath = path.join(__dirname, "nyx_sandblast_widget_six_domain_marion_access.html");
const widget = fs.readFileSync(widgetPath, "utf8");
const byteSize = Buffer.byteLength(widget, "utf8");
if (byteSize > 49999) throw new Error(`Widget exceeds 49,999 bytes: ${byteSize}`);
if (/clean Marion answer/i.test(widget)) throw new Error("Widget still exposes clean-Marion failure text.");
if (/Progression active: run next validation/i.test(widget)) throw new Error("Widget still contains progression loop fallback.");
const bad = /progression active|run next validation|mark passed or failed|clean marion answer|telemetry|diagnostics|finalEnvelope/i;
const prompts = [
  ["Tell me about cash flow", "cash"],
  ["Tell me about cognitive", "cognitive"],
  ["Tell me about auditing", "audit"],
  ["What is least privilege?", "access"],
  ["Explain phishing", "phishing"],
  ["What is syntax?", "syntax"],
  ["Tell me about machine learning", "machine"]
];
function baseInput(prompt) {
  return {
    message: prompt,
    text: prompt,
    userQuery: prompt,
    inputSource: "text",
    lane: "general",
    requireMarionFinal: true,
    publicDomainAccess: true,
    forceDomainAnswer: true,
    domainAccess: ["english", "psychology", "ai", "finance", "cyber", "law"],
    ui: { publicSurfaceOnly: true, finalEnvelope: true, domainAccess: true }
  };
}
(async () => {
  for (const [prompt, needle] of prompts) {
    const out = await bridge.processWithMarion(baseInput(prompt));
    const reply = String(out.reply || out.text || out.answer || out.output || (out.payload && out.payload.reply) || (out.finalEnvelope && out.finalEnvelope.reply) || "").trim();
    if (!reply) throw new Error(`Blank bridge reply for: ${prompt}`);
    if (bad.test(reply)) throw new Error(`Unsafe bridge reply for ${prompt}: ${reply}`);
    if (!reply.toLowerCase().includes(needle)) throw new Error(`Reply did not address ${needle}: ${reply}`);
    console.log("PASS bridge:", prompt, "=>", reply.slice(0, 110));
  }
  const routed = {
    ok: true,
    marionIntent: { activate: true, intent: "domain_question", confidence: .92, knowledgeDomain: "finance", knowledgeDomainExplicit: true },
    routing: { domain: "finance", intent: "domain_question", knowledgeDomain: "finance", lane: "general", endpoint: "marion://routeMarion.primary", mode: "knowledge_domain", depth: "balanced" }
  };
  const c = await composer.composeMarionResponse(routed, baseInput("Tell me about cash flow"));
  const cr = String(c.reply || c.text || c.answer || "").trim();
  if (!/cash flow/i.test(cr)) throw new Error("Composer two-arg finance route failed.");
  console.log("PASS composer routed cash flow:", cr.slice(0, 110));
  console.log("PASS widget bytes:", byteSize);
})().catch(err => { console.error(err.stack || err.message || err); process.exit(1); });

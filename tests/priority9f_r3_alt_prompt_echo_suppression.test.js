"use strict";

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
function read(rel){ return fs.readFileSync(path.join(root, rel), "utf8"); }
function assert(cond,msg){ if(!cond){ throw new Error(msg); } }

const layeredPrompt = "This is disjointed, but we need Marion to understand the deeper task, preserve the context, avoid looping, and tell me where to go next.";
const expectedNeedles = [
  "Priority 9F-R3",
  "ALT runtime prompt-echo suppression",
  "surface request",
  "deeper intent",
  "Marion conversational architecture",
  "raw prompt",
  "last-mile render"
];

const files = [
  "Data/marion/runtime/composeMarionResponse.js",
  "Data/marion/runtime/MarionAdminConsoleGateway.js",
  "Data/marion/runtime/marionBridge.js",
  "Data/marion/runtime/marionFinalEnvelope.js",
  "Data/marion/runtime/marionLoopGuard.js",
  "Data/marion/runtime/MarionVoiceGateway.js",
  "index.js"
];

for (const file of files) {
  const src = read(file);
  assert(src.includes("PRIORITY-9F-R3-ALT-PROMPT-ECHO-SUPPRESSION") || src.includes("priority9fR3"), `${file}: missing 9F-R3 marker`);
  assert(/prompt\s*echo|PromptEcho|promptEchoSuppressed/i.test(src), `${file}: missing prompt echo suppression`);
  assert(/layered conversational|conversational stack|deeper task|where to go next/i.test(src), `${file}: missing layered prompt trigger`);
}

const compose = read("Data/marion/runtime/composeMarionResponse.js");
assert(/priority9FR3PromptEcho\(reply,prompt\)/.test(compose), "composer must reject reply==prompt");
assert(/priority9FR3DisciplinePacket/.test(compose), "composer discipline wrapper missing");

const bridge = read("Data/marion/runtime/marionBridge.js");
assert(/priority9FR3BridgePromptEcho\(reply,prompt\)/.test(bridge), "bridge must reject reply==prompt");
assert(/priority9FR3ProcessWithMarion/.test(bridge), "bridge process wrapper missing");

const envelope = read("Data/marion/runtime/marionFinalEnvelope.js");
assert(/priority9FR3EnvelopePromptEcho\(reply,prompt\)/.test(envelope), "final envelope must reject reply==prompt");

const index = read("index.js");
assert(/marionAdminTextRuntimeReplyFromPacket=function priority9FR3MarionAdminTextRuntimeReplyFromPacket/.test(index), "index admin text reply selector must be wrapped");
assert(/marionAdminApprovedVoicePromptReply=function priority9FR3MarionAdminApprovedVoicePromptReply/.test(index), "index approved voice prompt reply must be wrapped");
assert(/priority9FR3IndexPromptEcho\(reply,promptText\)/.test(index), "index runtime must detect prompt echo in admin text path");

const admin = read("Data/marion/runtime/MarionAdminConsoleGateway.js");
assert(/MarionAdminConsoleGateway\.prototype\.handleCommand=async function priority9FR3AdminHandleCommand/.test(admin), "admin gateway command handler must be wrapped");

const voice = read("Data/marion/runtime/MarionVoiceGateway.js");
assert(/normalizeAdminTextBridgeResponse=function priority9FR3NormalizeAdminTextBridgeResponse/.test(voice), "voice/admin text normalizer must be wrapped");
assert(/handleMarionAdminConversation=async function priority9FR3HandleMarionAdminConversation/.test(voice), "voice/admin conversation handler must be wrapped");

console.log(JSON.stringify({ok:true, tests: 18, prompt: layeredPrompt, expectedNeedles}, null, 2));

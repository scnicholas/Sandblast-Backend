
const path = require("path");
const modules = [
  "Data/marion/runtime/marionFinalEnvelope.js",
  "Data/marion/runtime/marionBridge.js",
  "Data/marion/runtime/MarionAdminConsoleGateway.js",
  "Data/marion/runtime/progressionMemory.js",
  "Data/marion/runtime/progressionShape.js",
  "Data/marion/runtime/marionIntentRouter.js",
  "Utils/stateSpine.js"
];
const root = process.argv[2];
for (const m of modules) {
  const mod = require(path.join(root, m));
  if (!mod.priority9JR1BVisibleReply) { console.log("NO_R1B", m); continue; }
  const reply = mod.priority9JR1BVisibleReply({ reply: { foo: "bar" } }, "What is the next operational move?");
  if (!reply || /\[object Object\]/.test(reply) || !/next operational move/i.test(reply)) {
    throw new Error("bad reply from "+m+": "+reply);
  }
  const obj = mod.priority9JR1BObjectReplySerializationGuardFinal({ reply: { nested: true }, result: { reply: { bad: true } } }, "What is the next operational move?", "object");
  if (!obj || typeof obj.reply !== "string" || /\[object Object\]/.test(obj.reply)) throw new Error("bad object guard "+m);
}
console.log(JSON.stringify({ok:true, modules: modules.length}));

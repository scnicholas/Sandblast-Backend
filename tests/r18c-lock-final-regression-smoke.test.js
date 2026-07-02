"use strict";

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${rel}`);
  return fs.readFileSync(file, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const index = read("index.js");
const chatEngine = read("Utils/chatEngine.js");
const composer = read("Data/marion/runtime/composeMarionResponse.js");
const bridge = read("Data/marion/runtime/marionBridge.js");
const envelope = read("Data/marion/runtime/marionFinalEnvelope.js");
const adapter = read("src/guardians/adapters/guardian.response.adapter.js");

const joined = [index, chatEngine, composer, bridge, envelope, adapter].join("\n");

assert(/activePathCohesionRepair|R18C_ACTIVE_PATH_COHESION|r18CActivePathCohesionRepair/i.test(joined), "R18C active-path cohesion marker missing.");
assert(/replyQueueParityRepair|R18C_REPLY_QUEUE_PARITY|r18CReplyQueueParityRepair/i.test(joined), "R18C reply queue parity marker missing.");
assert(/finalMaterializerPrecedenceRepair|R18C_FINAL_MATERIALIZER_PRECEDENCE|r18cFinalMaterializerPrecedence/i.test(joined), "R18C materializer precedence marker missing.");
assert(/r18c\.finalAnswerMaterializer\/1\.1-precedence-repair|r18CFinalAnswerMaterializer/i.test(joined), "R18C final answer materializer marker missing.");
assert(!fs.existsSync(path.join(root, "Utils", "marionBridge.js")), "Utils/marionBridge.js must not be present in the lock package.");
assert(/Data[\\\/]marion[\\\/]runtime[\\\/]marionBridge\.js|Data","marion","runtime","marionBridge\.js|Data","marion","runtime","marionBridge/i.test(index + "\n" + chatEngine), "Canonical runtime bridge path not visible in loader files.");

console.log("PASS r18c-lock-final-regression-smoke.test.js");

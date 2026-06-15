"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const gatewayPath = path.join(__dirname, "..", "..", "Data", "marion", "runtime", "MarionVoiceGateway.js");
const source = fs.readFileSync(gatewayPath, "utf8");

assert(!source.includes("const opts = options && typeof options === 'object' ? options : {};\n  return policy.adminVoiceDeliveryAllowed"), "isAdminVoiceDeliveryAllowed must not reference undefined options");
assert(/function makeNyxBoundaryResponse\(response, voiceEnvelope, telemetry, outputPolicy, options\) \{\n\s+const opts = options && typeof options === 'object' \? options : \{\};/.test(source), "makeNyxBoundaryResponse must define opts from options");
assert(source.includes("handleMarionAdminConversation"), "Marion admin conversation handler must remain exported");
assert(source.includes("marion.voiceGateway/2.7.1-marion-admin-interface-opts-hotfix"), "hotfix version marker missing");
assert(!source.includes("<<<<<<<") && !source.includes(">>>>>>>") && !source.includes("======="), "merge conflict marker found");

console.log("PASS marion-admin-gateway-opts-hotfix");

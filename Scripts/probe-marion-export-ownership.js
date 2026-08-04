"use strict";

const path = require("path");

const root = path.resolve(__dirname, "..");
const checks = [
  {
    name: "marionBridge",
    file: path.join(root, "Data", "marion", "runtime", "marionBridge.js"),
    expected: [
      "processWithMarion",
      "handleMarionAdminConversation",
      "handleMarionAdminTextRuntime",
      "handleAdminConversation",
      "invokeMarionAdminTextRuntime",
      "handleTextRuntime",
      "marionPrivateRuntimeIdentityProjection"
    ]
  },
  {
    name: "composeMarionResponse",
    file: path.join(
      root,
      "Data",
      "marion",
      "runtime",
      "composeMarionResponse.js"
    ),
    expected: [
      "composeMarionResponse",
      "run",
      "default",
      "marionPrivateRuntimeIdentityProjection"
    ]
  },
  {
    name: "marionAdminRuntimeSafety",
    file: path.join(
      root,
      "Data",
      "marion",
      "runtime",
      "marionAdminRuntimeSafety.js"
    ),
    expected: [
      "cleanText",
      "errorText",
      "firstText",
      "primitiveText",
      "privatePartitionKey",
      "privateRuntimeIdentity",
      "safeRead",
      "safeSerializable",
      "isPrivateRuntimeIdentity"
    ]
  }
];

let failures = 0;

for (const check of checks) {
  console.log("\nMODULE:", check.name);
  console.log("PATH:", check.file);

  try {
    const loaded = require(check.file);
    console.log("EXPORT TYPE:", typeof loaded);

    for (const name of check.expected) {
      const type = typeof (loaded && loaded[name]);
      const status = type === "function" ? "PASS" : "FAIL";
      console.log(status.padEnd(6), name.padEnd(42), type);
      if (type !== "function") failures += 1;
    }
  } catch (error) {
    failures += 1;
    console.error(
      "LOAD FAILED:",
      error && (error.stack || error.message || error)
    );
  }
}

console.log("\nOWNERSHIP-AWARE EXPORT FAILURES:", failures);
process.exitCode = failures ? 1 : 0;

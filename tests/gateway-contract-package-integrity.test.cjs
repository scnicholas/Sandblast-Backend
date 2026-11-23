"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const target = path.join(__dirname, "gateway-contract.test.js");
const source = fs.readFileSync(target, "utf8");
test("positive async final contract has not been weakened", () => {
  assert.match(source, /asynchronous bridge final must be certified/);
  assert.match(source, /assert\.equal\(finalized\.finalEnvelope\.marionFinal, true\)/);
  assert.match(source, /assert\.equal\(finalized\.finalEnvelope\.replySignature, replyHash\(reply\)\)/);
});
test("live private finance contract requires certified emission and answer parity", () => {
  assert.match(source, /private finance turn did not clear the real gateway authority boundary/);
  assert.match(source, /out\.final === true && out\.marionFinal === true && out\.canEmit === true/);
  assert.match(source, /assert\.match\(out\.reply, \/1\\\.\//);
  assert.match(source, /assert\.equal\(out\[alias\], out\.reply/);
});
test("uncertified bridge packet must be rejected by private gateway", () => {
  assert.match(source, /if \(!certified\)/);
  assert.match(source, /assert\.equal\(gatewayReply\.ok, false/);
  assert.match(source, /assert\.equal\(gatewayReply\.canEmit, false\)/);
});
test("diagnostic snapshot excludes reply text and token fields", () => {
  const section = source.slice(source.indexOf("function authoritySnapshot"), source.indexOf("function assertCertified"));
  assert.ok(section.includes("signaturePresent"));
  assert.ok(section.includes("replyHashMatches"));
  assert.doesNotMatch(section, /replyText\s*:/);
  assert.doesNotMatch(section, /token\s*:/);
});

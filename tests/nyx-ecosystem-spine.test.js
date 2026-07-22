"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const spine = require("../Utils/nyxEcosystemSpine");

test("manifest contains every public Sandblast surface", () => {
  const m = spine.readManifest();
  for (const name of ["home","radio","tv","roku","synapse","lingosentinel","apps","about","start"]) assert.ok(m.surfaces[name], name);
  assert.equal(m.publicOnly, true);
});
test("aliases normalize without exposing private surfaces", () => {
  assert.equal(spine.surfaceName("live"), "radio");
  assert.equal(spine.surfaceName("watch"), "tv");
  assert.equal(spine.surfaceName("marion"), "home");
});
test("transition preserves continuity and requires a user gesture", () => {
  const result = spine.transition({current:"home",target:"radio",action:"navigate",sessionId:"test"});
  assert.equal(result.ok, true); assert.equal(result.target, "radio");
  assert.equal(result.context.previous, "home"); assert.equal(result.userGestureRequired, true); assert.equal(result.autoNavigate, false);
});
test("private targets and unknown actions fail closed", () => {
  assert.equal(spine.transition({target:"marion",action:"navigate"}).ok, false);
  assert.equal(spine.transition({target:"radio",action:"execute_private"}).ok, false);
});

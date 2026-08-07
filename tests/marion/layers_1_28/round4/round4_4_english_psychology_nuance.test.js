"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertSourceHasDomains,
  readText,
  loadExact,
  assertCommonJsApi
} = require("./_round4_common.js");

test(
  "Round 4.4 English and Psychology remain available as distinct domains",
  () => {
    assertSourceHasDomains(
      "Data/marion/runtime/marionDomainRegistry.js",
      [
        "english",
        "psychology"
      ]
    );
  }
);

test(
  "Round 4.4 language/psychology nuance remains downstream of Marion reply composition",
  () => {
    const composer =
      loadExact(
        "Data/marion/runtime/composeMarionResponse.js"
      );

    assertCommonJsApi(
      composer,
      "Compose Marion Response"
    );

    const source =
      readText(
        "Data/marion/runtime/composeMarionResponse.js"
      );

    assert.ok(
      /reply|response|compose/i.test(source),
      "Composer does not expose a recognizable reply-composition contract."
    );

    assert.strictEqual(
      /throw\s+new\s+Error\s*\(\s*["'][^"']*(psychology|english)/i.test(source),
      false,
      "English/Psychology handling contains a hard-coded user-facing failure path."
    );
  }
);

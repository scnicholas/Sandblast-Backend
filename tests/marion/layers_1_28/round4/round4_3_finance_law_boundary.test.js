"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  loadExact,
  assertCommonJsApi,
  assertSourceHasDomains,
  readText
} = require("./_round4_common.js");

const REGISTRY =
  "Data/marion/runtime/marionDomainRegistry.js";

const ROUTER =
  "Data/marion/runtime/marionIntentRouter.js";

test(
  "Round 4.3 Finance and Law remain distinct registered domains",
  () => {
    assertSourceHasDomains(
      REGISTRY,
      [
        "finance",
        "law"
      ]
    );

    const source =
      readText(REGISTRY)
        .toLowerCase();

    const financeIndex =
      source.indexOf("finance");

    const lawIndex =
      source.indexOf("law");

    assert.ok(
      financeIndex >= 0 &&
      lawIndex >= 0 &&
      financeIndex !== lawIndex,
      "Finance and Law must remain separately represented."
    );
  }
);

test(
  "Round 4.3 Finance/Law routing layer loads without taking reply authority",
  () => {
    const router =
      loadExact(ROUTER);

    assertCommonJsApi(
      router,
      "Marion Intent Router"
    );

    const source =
      readText(ROUTER);

    assert.strictEqual(
      /replyAuthority\s*=\s*["'](?:router|intent)/i.test(source),
      false,
      "Intent Router appears to claim final reply authority."
    );
  }
);

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SIX_DOMAINS,
  loadExact,
  callable,
  assertCommonJsApi,
  assertSourceHasDomains
} = require("./_round4_common.js");

const REGISTRY =
  "Data/marion/runtime/marionDomainRegistry.js";

const ROUTER =
  "Data/marion/runtime/marionIntentRouter.js";

test(
  "Round 4.1 domain registry and intent router load from canonical runtime paths",
  () => {
    const registry =
      loadExact(REGISTRY);

    const router =
      loadExact(ROUTER);

    assertCommonJsApi(
      registry,
      "Marion Domain Registry"
    );

    assertCommonJsApi(
      router,
      "Marion Intent Router"
    );

    assert.ok(
      callable(
        registry,
        [
          "resolveDomain",
          "getDomain",
          "get",
          "listDomains",
          "register",
          "run",
          "default"
        ]
      ) ||
      Object.keys(registry).length > 0,
      "Marion Domain Registry exposes no usable contract."
    );

    assert.ok(
      callable(
        router,
        [
          "route",
          "routeIntent",
          "resolve",
          "classify",
          "detect",
          "run",
          "default"
        ]
      ) ||
      Object.keys(router).length > 0,
      "Marion Intent Router exposes no usable contract."
    );
  }
);

test(
  "Round 4.1 registry represents all six Sandblast knowledge domains",
  () => {
    assertSourceHasDomains(
      REGISTRY,
      SIX_DOMAINS
    );
  }
);

test(
  "Round 4.1 router retains cross-domain routing references",
  () => {
    assertSourceHasDomains(
      ROUTER,
      [
        "ai",
        "cyber"
      ]
    );

    const source =
      require("fs")
        .readFileSync(
          require("./_round4_common.js")
            .abs(ROUTER),
          "utf8"
        )
        .toLowerCase();

    assert.ok(
      /domain|intent|route|classif/.test(source),
      "Intent Router does not expose a recognizable routing contract."
    );
  }
);

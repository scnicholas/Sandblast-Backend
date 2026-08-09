"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SIX_DOMAINS,
  assertSourceHasTerms,
  readText,
  loadExact,
  assertCommonJsApi
} = require("./_round6_common.js");

test(
  "Round 6.4 six-domain registry remains intact after service certification",
  () => {
    assertSourceHasTerms(
      "Data/marion/runtime/marionDomainRegistry.js",
      SIX_DOMAINS
    );
  }
);

test(
  "Round 6.4 intent routing, response composition, service transport, and continuity remain separate authorities",
  () => {
    const router =
      loadExact(
        "Data/marion/runtime/marionIntentRouter.js"
      );

    const finalEnvelope =
      loadExact(
        "Data/marion/runtime/marionFinalEnvelope.js"
      );

    const composer =
      loadExact(
        "Data/marion/runtime/composeMarionResponse.js"
      );

    const bridge =
      loadExact(
        "Data/marion/runtime/marionBridge.js"
      );

    const chat =
      loadExact(
        "utils/chatEngine.js"
      );

    const state =
      loadExact(
        "utils/stateSpine.js"
      );

    for (
      const [label, api]
      of Object.entries({
        router,
        finalEnvelope,
        composer,
        bridge,
        chat,
        state
      })
    ) {
      assertCommonJsApi(
        api,
        label
      );
    }

    const routerSource =
      readText(
        "Data/marion/runtime/marionIntentRouter.js"
      );

    assert.strictEqual(
      /replyAuthority\s*=\s*["'](?:router|intent)/i.test(
        routerSource
      ),
      false,
      "Intent routing appears to claim final reply authority."
    );

    const composerSource =
      readText(
        "Data/marion/runtime/composeMarionResponse.js"
      );

    assert.ok(
      /reply|response|compose/i.test(
        composerSource
      ),
      "ComposeMarionResponse no longer exposes a recognizable response contract."
    );

    const finalEnvelopeSource =
      readText(
        "Data/marion/runtime/marionFinalEnvelope.js"
      );

    assert.ok(
      /final|envelope|reply/i.test(
        finalEnvelopeSource
      ),
      "Marion Final Envelope no longer exposes a recognizable terminal-envelope contract."
    );

    const chatSource =
      readText(
        "utils/chatEngine.js"
      );

    assert.ok(
      /finalEnvelope|finalReply|spokenText|reply/i.test(
        chatSource
      ),
      "ChatEngine no longer exposes the expected transport-envelope vocabulary."
    );
  }
);

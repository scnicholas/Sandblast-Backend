"use strict";

const assert = require("assert");
const { loadIndex } = require("./_index_test_harness.js");
const { backend, expressStub } = loadIndex();

const route = backend.app._routes.find(
  (item) => item.method === "POST" && item.paths.includes("/api/chat")
);
assert.ok(route, "POST /api/chat route was not registered");

function makeRequest(staleLaw) {
  const suffix = staleLaw ? "stale" : "clean";

  return {
    method: "POST",
    path: "/api/chat",
    originalUrl: "/api/chat",
    url: "/api/chat",
    headers: {
      origin: "https://www.sandblast.channel",
      "x-sb-session-id": `media_${suffix}`,
      "x-sb-turn-id": `turn_${suffix}`,
      "x-sb-trace-id": `trace_${suffix}`
    },
    body: {
      audience: "public",
      lane: "public_interface",
      presentationProfile: "public",
      publicSurfaceOnly: true,
      publicIdentityLock: true,
      message: "What can I watch on Sandblast?",
      text: "What can I watch on Sandblast?",
      sessionId: `media_${suffix}`,
      turnId: `turn_${suffix}`,
      ...(staleLaw ? {
        domainHint: "law",
        intentHint: "domain_question",
        guideContext: {
          currentLane: "law",
          previousLane: "law",
          goal: "ask"
        },
        payload: {
          domain: "law",
          primaryDomain: "law",
          selectedDomain: "law",
          knowledgeDomain: "law",
          legalCategory: "general_legal_risk"
        }
      } : {})
    }
  };
}

function execute(req) {
  return new Promise((resolve, reject) => {
    const res = Object.create(expressStub.response);
    res.req = req;
    res.headers = {};
    res.statusCode = 200;
    res.headersSent = false;

    let index = 0;
    let settled = false;

    const timer = setTimeout(
      () => finish(new Error("POST /api/chat regression timed out")),
      7000
    );

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(res);
    }

    function next(error) {
      if (error) return finish(error);

      const handler = route.handlers[index++];
      if (!handler) return finish();

      try {
        const result = handler(req, res, next);

        if (result && typeof result.then === "function") {
          result
            .then(() => {
              if (res.headersSent) finish();
            })
            .catch(finish);
        } else if (res.headersSent) {
          finish();
        }
      } catch (caught) {
        finish(caught);
      }
    }

    next();
  });
}

function assertMediaResponse(body, label) {
  assert.ok(body && typeof body === "object", `${label}: response body missing`);
  assert.match(body.reply, /watch|tv|roku|cartoon|movie/i);

  assert.doesNotMatch(
    body.reply,
    /legal-risk triage|not legal advice|legal category|jurisdiction sensitivity/i
  );

  assert.strictEqual(body.routeType, "knowledge");
  assert.strictEqual(body.actionMode, "answer");
  assert.strictEqual(body.semanticRoute, true);
  assert.strictEqual(body.navigationRoute, false);
  assert.strictEqual(body.actionRequired, false);
  assert.strictEqual(body.validateAction, false);
  assert.strictEqual(body.actionValidationRequired, false);
  assert.strictEqual(body.pendingActionValidation, false);
  assert.strictEqual(body.answerOnly, true);
  assert.strictEqual(body.domain, "media");

  assert.strictEqual(body.payload.actionRequired, false);
  assert.strictEqual(body.payload.validateAction, false);
  assert.strictEqual(body.finalEnvelope.actionRequired, false);
  assert.strictEqual(body.finalEnvelope.validateAction, false);
}

(async () => {
  const clean = await execute(makeRequest(false));
  assertMediaResponse(clean.body, "clean session");

  const stale = await execute(makeRequest(true));
  assertMediaResponse(stale.body, "stale Law session");

  console.log("PASS: index media response-edge contract and stale-Law override");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

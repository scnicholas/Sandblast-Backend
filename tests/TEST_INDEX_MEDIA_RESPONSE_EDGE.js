"use strict";

const assert = require("assert");
const Module = require("module");

function buildExpressStub() {
  const response = {
    status(code) { this.statusCode = code; return this; },
    set(name, value) {
      this.headers = this.headers || {};
      this.headers[String(name).toLowerCase()] = String(value);
      return this;
    },
    header(name, value) { return this.set(name, value); },
    setHeader(name, value) { return this.set(name, value); },
    getHeader(name) {
      return this.headers && this.headers[String(name).toLowerCase()];
    },
    type(value) { this.contentType = value; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
    send(body) { this.body = body; this.headersSent = true; return this; },
    end(body) { this.body = body; this.headersSent = true; return this; },
    sendFile(filePath) { this.file = filePath; this.headersSent = true; return this; },
    redirect() {
      this.redirectArgs = Array.from(arguments);
      this.headersSent = true;
      return this;
    }
  };

  function express() {
    const routes = [];
    const app = {
      locals: {},
      _routes: routes,
      _router: { stack: [] },
      set() { return app; },
      disable() { return app; },
      use() { return app; },
      listen(_port, callback) {
        if (callback) callback();
        return { close(done) { if (done) done(); } };
      }
    };

    for (const method of ["get", "post", "options", "head", "all", "delete"]) {
      app[method] = function register(paths, ...handlers) {
        routes.push({
          method: method.toUpperCase(),
          paths: Array.isArray(paths) ? paths : [paths],
          handlers
        });
        return app;
      };
    }

    return app;
  }

  express.response = response;
  express.json = () => (_req, _res, next) => next && next();
  express.urlencoded = () => (_req, _res, next) => next && next();
  express.static = () => (_req, _res, next) => next && next();
  return express;
}

const expressStub = buildExpressStub();
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "express") return expressStub;
  return originalLoad.call(this, request, parent, isMain);
};

process.env.SB_INDEX_AUTO_LISTEN = "false";
process.env.SB_INDEX_ATTACH_SIGNAL_HANDLERS = "false";

const backend = require("../index.js");
const route = backend.app._routes.find(
  (item) => item.method === "POST" && item.paths.includes("/api/chat")
);
assert.ok(route, "POST /api/chat route was not registered");

function makeRequest(staleLaw) {
  return {
    method: "POST",
    path: "/api/chat",
    originalUrl: "/api/chat",
    url: "/api/chat",
    headers: {
      "x-sb-session-id": staleLaw ? "autopsy_stale_session" : "autopsy_clean_session",
      "x-sb-turn-id": staleLaw ? "autopsy_stale_turn" : "autopsy_clean_turn",
      "x-sb-trace-id": staleLaw ? "autopsy_stale_trace" : "autopsy_clean_trace",
      origin: "https://www.sandblast.channel"
    },
    body: {
      audience: "public",
      lane: "public_interface",
      presentationProfile: "public",
      publicSurfaceOnly: true,
      publicIdentityLock: true,
      text: "What can I watch on Sandblast?",
      message: "What can I watch on Sandblast?",
      sessionId: staleLaw ? "autopsy_stale_session" : "autopsy_clean_session",
      turnId: staleLaw ? "autopsy_stale_turn" : "autopsy_clean_turn",
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
      () => finish(new Error("POST /api/chat test timed out")),
      5000
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
              if (res.headersSent && index >= route.handlers.length) finish();
            })
            .catch(finish);
        } else if (res.headersSent && index >= route.handlers.length) {
          finish();
        }
      } catch (caught) {
        finish(caught);
      }
    }

    next();
  });
}

function assertMediaResponse(res, label) {
  const body = res.body;
  assert.ok(body && typeof body === "object", `${label}: response body missing`);
  const reply = String(body.reply || body.publicReply || body.text || "");
  assert.match(reply, /watch|tv|roku|cartoon|movie/i, `${label}: media answer missing`);
  assert.doesNotMatch(
    reply,
    /legal-risk triage|not legal advice|legal category|jurisdiction sensitivity/i,
    `${label}: Law reply leaked through response edge`
  );
  assert.strictEqual(body.actionRequired, false, `${label}: discovery became an action`);
  assert.strictEqual(body.validateAction, false, `${label}: discovery requested validation`);
}

(async () => {
  const clean = await execute(makeRequest(false));
  assertMediaResponse(clean, "clean session");

  const stale = await execute(makeRequest(true));
  assertMediaResponse(stale, "stale Law session");

  console.log(JSON.stringify({
    cleanReply: clean.body.reply || clean.body.text,
    staleLawReply: stale.body.reply || stale.body.text,
    cleanActionRequired: clean.body.actionRequired,
    staleActionRequired: stale.body.actionRequired
  }, null, 2));
  console.log("PASS: index response-edge current-turn authority");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

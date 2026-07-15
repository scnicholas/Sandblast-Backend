"use strict";

const Module = require("module");

function buildExpressStub() {
  const response = {
    status(code) { this.statusCode = code; return this; },
    set(name, value) {
      this.headers = this.headers || {};
      this.headers[String(name).toLowerCase()] = String(value);
      return this;
    },
    setHeader(name, value) { return this.set(name, value); },
    header(name, value) { return this.set(name, value); },
    getHeader(name) {
      return this.headers && this.headers[String(name).toLowerCase()];
    },
    type() { return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
    send(body) { this.body = body; this.headersSent = true; return this; },
    end(body) { this.body = body; this.headersSent = true; return this; },
    sendFile() { this.headersSent = true; return this; },
    redirect() { this.headersSent = true; return this; }
  };

  function express() {
    const routes = [];
    const app = {
      locals: {},
      _routes: routes,
      _router: { stack: [] },
      disable() { return app; },
      set() { return app; },
      use() { return app; },
      listen(_port, callback) {
        if (callback) callback();
        return { close(done) { if (done) done(); } };
      }
    };

    for (const method of ["get", "post", "options", "head", "all", "delete", "put", "patch"]) {
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

function loadIndex() {
  const expressStub = buildExpressStub();
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "express") return expressStub;

    if (request === "compression") {
      const error = new Error("optional dependency unavailable in isolated regression test");
      error.code = "MODULE_NOT_FOUND";
      throw error;
    }

    try {
      return originalLoad.call(this, request, parent, isMain);
    } catch (error) {
      if (
        error &&
        error.code === "MODULE_NOT_FOUND" &&
        (request.startsWith("./") || request.startsWith("../"))
      ) {
        return {};
      }
      throw error;
    }
  };

  process.env.SB_INDEX_AUTO_LISTEN = "false";
  process.env.SB_INDEX_ATTACH_SIGNAL_HANDLERS = "false";

  const originalLog = console.log;
  console.log = () => {};
  let backend;

  try {
    backend = require("../index.js");
  } finally {
    console.log = originalLog;
    Module._load = originalLoad;
  }

  return { backend, expressStub };
}

module.exports = {
  buildExpressStub,
  loadIndex
};

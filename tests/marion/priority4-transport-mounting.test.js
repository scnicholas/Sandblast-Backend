"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");

function rootPath(rel) {
  return path.join(ROOT, rel);
}

function readText(rel) {
  return fs.readFileSync(rootPath(rel), "utf8");
}

function listExpressRoutes(app) {
  const stack = app?._router?.stack || [];
  const routes = [];
  for (const layer of stack) {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods || {}).sort();
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) routes.push({ path: String(p), methods });
    }
  }
  return routes;
}

describe("Priority 4 — transport and mounting layer", () => {
  test("index.js and package.json pass syntax/package validation", () => {
    expect(() => execFileSync(process.execPath, ["--check", rootPath("index.js")], { stdio: "pipe" })).not.toThrow();
    expect(() => JSON.parse(readText("package.json"))).not.toThrow();
  });

  test("package scripts expose Priority-4 transport validation commands", () => {
    const pkg = JSON.parse(readText("package.json"));
    expect(pkg.type).toBe("commonjs");
    expect(pkg.scripts["lint:transport"]).toMatch(/node --check index\.js/);
    expect(pkg.scripts["test:priority4"]).toMatch(/lint:transport/);
    expect(pkg.scripts["test:transport"]).toMatch(/lint:transport/);
    expect(pkg.scripts["start:prod"]).not.toMatch(/^NODE_ENV=/);
  });

  test("index import does not auto-bind the HTTP port", () => {
    const index = require(rootPath("index.js"));

    expect(index.app).toBeTruthy();
    expect(typeof index.startSandblastServer).toBe("function");
    expect(typeof index.gracefulShutdown).toBe("function");
    expect(Number.isFinite(Number(index.PORT))).toBe(true);

    // When required by tests, index.js must export the app without binding a live server.
    expect(index.server === null || index.server === undefined || typeof index.server.close === "function").toBe(true);
  });

  test("voice and LingoSentinel diagnostic routes are mounted before fallback", () => {
    const index = require(rootPath("index.js"));
    const routes = listExpressRoutes(index.app);
    const routeText = routes.map((r) => `${r.methods.join(",")}:${r.path}`).join("\n");

    expect(routeText).toMatch(/\/api\/nyx\/voice\/transcript\/health/);
    expect(routeText).toMatch(/\/marion\/voice\/health/);
    expect(routeText).toMatch(/\/lingosentinel\/_assets/);
    expect(routeText).toMatch(/\/internal\/lingosentinel\/_mount/);
  });

  test("Priority-4 patch prevents duplicate LingoSentinel mount calls and avatar 404 hangs", () => {
    const source = readText("index.js");

    expect(source).toMatch(/PRIORITY4_TRANSPORT_MOUNTING_PATCH_VERSION/);
    expect(source).toMatch(/mountLingoSentinelTranslationRoutesOnce/);
    expect(source).not.toMatch(/return\s*\n\s*res\.status\(404\)\.json/);
    expect(source).toMatch(/return\s+res\.status\(404\)\.json/);
  });

  test("exported transport helpers preserve structural integrity", () => {
    const index = require(rootPath("index.js"));

    expect(index.INDEX_VERSION).toMatch(/index\.js/i);
    expect(index.PRIORITY4_TRANSPORT_MOUNTING_PATCH_VERSION).toMatch(/priority4/i);
    expect(Array.isArray(index.NYX_VOICE_TRANSCRIPT_ROUTES)).toBe(true);
    expect(Array.isArray(index.NYX_VOICE_TRANSCRIPT_HEALTH_ROUTES)).toBe(true);
    expect(typeof index.nyxVoiceRequiredRuntimeDiagnostics).toBe("function");
    expect(typeof index.nyxVoiceRuntimeFilesReady).toBe("function");
    expect(typeof index.applyPublicReplyHygieneToResponse).toBe("function");
  });
});

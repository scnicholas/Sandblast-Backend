"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { performance } = require("perf_hooks");

const ROOT = path.resolve(__dirname, "../../../..");
const ROUND_DIR = __dirname;

const WARNING_RE =
  /Accessing non-existent property|inside circular dependency/i;

const CONFLICT_RE =
  /^(?:<<<<<<<|=======|>>>>>>>)/m;

const INTERNAL_LEAK_RE =
  /\b(?:TypeError|ReferenceError|SyntaxError|diagnostic packet|stack trace|recovery path engaged)\b/i;

const SIX_DOMAINS = Object.freeze([
  "psychology",
  "english",
  "ai",
  "cyber",
  "finance",
  "law"
]);

function abs(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeString(value) {
  try {
    return String(value == null ? "" : value);
  } catch (_) {
    return "";
  }
}

function readText(relativePath) {
  const file = abs(relativePath);

  assert.ok(
    fs.existsSync(file),
    `Required file is missing: ${relativePath}`
  );

  const text = fs.readFileSync(file, "utf8");

  assert.strictEqual(
    CONFLICT_RE.test(text),
    false,
    `Merge-conflict marker found: ${relativePath}`
  );

  return text;
}

function readJson(relativePath) {
  const source = readText(relativePath);

  try {
    return JSON.parse(source);
  } catch (error) {
    assert.fail(
      `Invalid JSON in ${relativePath}: ${
        error && error.message
          ? error.message
          : error
      }`
    );
  }
}

function normalizePath(value) {
  return path.normalize(value).toLowerCase();
}

function resolveExact(relativePath) {
  const candidate = abs(relativePath);

  assert.ok(
    fs.existsSync(candidate),
    `Required module is missing: ${relativePath}`
  );

  const resolved = require.resolve(candidate);

  assert.strictEqual(
    normalizePath(resolved),
    normalizePath(candidate),
    `Module resolution drifted: ${relativePath}`
  );

  return resolved;
}

function loadExact(relativePath) {
  const resolved = resolveExact(relativePath);

  try {
    return require(resolved);
  } catch (error) {
    throw new Error(
      [
        `Module failed during loading: ${relativePath}`,
        `Resolved: ${resolved}`,
        `Cause: ${
          error && error.message
            ? error.message
            : error
        }`
      ].join("\n"),
      { cause: error }
    );
  }
}

function ownFunction(target, name) {
  if (
    !target ||
    (
      typeof target !== "object" &&
      typeof target !== "function"
    )
  ) {
    return null;
  }

  try {
    const descriptor =
      Object.getOwnPropertyDescriptor(target, name);

    return descriptor &&
      typeof descriptor.value === "function"
      ? descriptor.value
      : null;
  } catch (_) {
    return null;
  }
}

function callable(target, names) {
  if (typeof target === "function") {
    return target;
  }

  for (const name of names) {
    const fn = ownFunction(target, name);
    if (fn) return fn.bind(target);
  }

  return null;
}

function assertCommonJsApi(api, label) {
  assert.ok(
    api &&
    (
      typeof api === "object" ||
      typeof api === "function"
    ),
    `${label} did not load as a CommonJS API.`
  );
}

function syntaxCheck(file) {
  const result =
    childProcess.spawnSync(
      process.execPath,
      [
        "--check",
        file
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024
      }
    );

  assert.strictEqual(
    result.error,
    undefined,
    result.error && result.error.message
  );

  assert.strictEqual(
    result.status,
    0,
    [
      `Syntax check failed: ${path.relative(ROOT, file)}`,
      result.stdout || "",
      result.stderr || ""
    ].join("\n")
  );
}

function runIsolated(
  name,
  source,
  timeout = 60000
) {
  const start = performance.now();

  const result =
    childProcess.spawnSync(
      process.execPath,
      [
        "--trace-warnings",
        "-e",
        source
      ],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          SB_TTS_LOG_ENABLED: "false"
        },
        encoding: "utf8",
        windowsHide: true,
        timeout,
        maxBuffer: 12 * 1024 * 1024
      }
    );

  const durationMs =
    performance.now() -
    start;

  assert.strictEqual(
    result.error,
    undefined,
    result.error &&
    result.error.message
  );

  const output =
    `${result.stdout || ""}\n${result.stderr || ""}`;

  assert.strictEqual(
    result.status,
    0,
    [
      `Isolated case failed: ${name}`,
      output
    ].join("\n")
  );

  assert.strictEqual(
    WARNING_RE.test(output),
    false,
    [
      `Circular warning detected: ${name}`,
      output
    ].join("\n")
  );

  return {
    name,
    ok: true,
    warnings: 0,
    durationMs: Number(durationMs.toFixed(3)),
    stdout: safeString(result.stdout).trim()
  };
}

function assertSourceHasDomains(
  relativePath,
  domains
) {
  const source =
    readText(relativePath)
      .toLowerCase();

  const missing =
    domains.filter(
      (domain) =>
        !source.includes(
          String(domain).toLowerCase()
        )
    );

  assert.deepStrictEqual(
    missing,
    [],
    `${relativePath} is missing domain registrations/references: ${missing.join(", ")}`
  );
}

function assertNoVisibleDiagnostics(value) {
  const text =
    safeString(value);

  assert.strictEqual(
    INTERNAL_LEAK_RE.test(text),
    false,
    "User-facing output contains internal diagnostics."
  );
}

function byteLength(value) {
  return Buffer.byteLength(
    JSON.stringify(value),
    "utf8"
  );
}

module.exports = {
  ROOT,
  ROUND_DIR,
  WARNING_RE,
  CONFLICT_RE,
  SIX_DOMAINS,
  abs,
  isObject,
  safeString,
  readText,
  readJson,
  normalizePath,
  resolveExact,
  loadExact,
  ownFunction,
  callable,
  assertCommonJsApi,
  syntaxCheck,
  runIsolated,
  assertSourceHasDomains,
  assertNoVisibleDiagnostics,
  byteLength
};

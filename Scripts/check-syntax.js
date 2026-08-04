"use strict";

/**
 * scripts/check-syntax.js
 *
 * Sandblast backend JavaScript syntax certification.
 *
 * - Uses the active Node executable (`process.execPath`).
 * - Recursively checks .js, .cjs, and .mjs files.
 * - Excludes dependencies, generated output, logs, archives, and backup copies.
 * - Never executes project modules; it invokes `node --check` only.
 * - Returns exit code 1 when any file fails.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const VERSION = "sandblast.checkSyntax/1.0-safe-recursive-node-check";
const ROOT = path.resolve(__dirname, "..");

const INCLUDED_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);

const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".github",
  ".idea",
  ".vscode",
  "node_modules",
  "coverage",
  "dist",
  "build",
  "out",
  "logs",
  "log",
  "tmp",
  "temp",
  ".cache",
  ".nyc_output"
]);

const EXCLUDED_DIRECTORY_PATTERNS = [
  /^backup(?:[-_.]|$)/i,
  /^archive(?:[-_.]|$)/i,
  /^_archive(?:[-_.]|$)/i,
  /^old(?:[-_.]|$)/i,
  /^deprecated(?:[-_.]|$)/i
];

const EXCLUDED_FILE_PATTERNS = [
  /\.backup\.(?:js|cjs|mjs)$/i,
  /\.bak\.(?:js|cjs|mjs)$/i,
  /\.old\.(?:js|cjs|mjs)$/i,
  /\.disabled\.(?:js|cjs|mjs)$/i,
  /\.copy\.(?:js|cjs|mjs)$/i,
  /~$/,
  /^\.#/,
  /^#.*#$/
];

function normalizeRelative(value) {
  return path.relative(ROOT, value).split(path.sep).join("/");
}

function isExcludedDirectory(name) {
  return (
    EXCLUDED_DIRECTORY_NAMES.has(name) ||
    EXCLUDED_DIRECTORY_PATTERNS.some((pattern) => pattern.test(name))
  );
}

function isExcludedFile(name) {
  return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

function collectJavaScriptFiles(directory, output = []) {
  let entries;

  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Unable to read directory ${normalizeRelative(directory) || "."}: ` +
      `${error && error.message ? error.message : error}`
    );
  }

  entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((entry) => {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!isExcludedDirectory(entry.name)) {
          collectJavaScriptFiles(absolutePath, output);
        }
        return;
      }

      if (!entry.isFile()) return;
      if (isExcludedFile(entry.name)) return;

      const extension = path.extname(entry.name).toLowerCase();

      if (INCLUDED_EXTENSIONS.has(extension)) {
        output.push(absolutePath);
      }
    });

  return output;
}

function syntaxCheck(filePath) {
  const result = spawnSync(
    process.execPath,
    ["--check", filePath],
    {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024
    }
  );

  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    signal: result.signal || "",
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error
      ? String(result.error.message || result.error)
      : ""
  };
}

function main() {
  const startedAt = Date.now();
  const files = collectJavaScriptFiles(ROOT);
  const failures = [];

  console.log(`[Sandblast Syntax] ${VERSION}`);
  console.log(`[Sandblast Syntax] Root: ${ROOT}`);
  console.log(`[Sandblast Syntax] Files discovered: ${files.length}`);

  for (const filePath of files) {
    const relativePath = normalizeRelative(filePath);
    const result = syntaxCheck(filePath);

    if (result.ok) {
      console.log(`PASS ${relativePath}`);
      continue;
    }

    failures.push({
      file: relativePath,
      ...result
    });

    console.error(`FAIL ${relativePath}`);

    if (result.stderr) {
      console.error(result.stderr);
    } else if (result.stdout) {
      console.error(result.stdout);
    } else if (result.error) {
      console.error(result.error);
    }
  }

  const elapsedMs = Date.now() - startedAt;

  console.log("");
  console.log(
    `[Sandblast Syntax] Checked ${files.length} file(s) in ${elapsedMs} ms.`
  );

  if (failures.length > 0) {
    console.error(
      `[Sandblast Syntax] FAIL: ${failures.length} file(s) have syntax errors.`
    );
    console.error(
      JSON.stringify(
        {
          ok: false,
          version: VERSION,
          root: ROOT,
          checked: files.length,
          failed: failures.length,
          failures
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  console.log("[Sandblast Syntax] PASS: all discovered JavaScript files are valid.");
}

try {
  main();
} catch (error) {
  console.error(
    "[Sandblast Syntax] FATAL:",
    error && error.stack ? error.stack : error
  );
  process.exitCode = 1;
}

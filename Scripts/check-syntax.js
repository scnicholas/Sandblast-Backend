#!/usr/bin/env node
"use strict";

// Syntax-check every .js, .mjs, and .cjs file beneath the selected project root.
// This uses Node's parser only; it does not resolve imports or run the files.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);
const CHILD_TIMEOUT_MS = 30_000;
const CHILD_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const MAX_DIAGNOSTIC_CHARS = 12_000;

function usage() {
  return [
    "Usage: node check-syntax.js [--root <directory>] [--help]",
    "",
    "Checks .js, .mjs, and .cjs files recursively with the current Node.js parser.",
    "By default, uses the nearest directory containing package.json or .git;",
    "if none is found, it uses the parent directory of this script.",
    "Directories named .git and node_modules are skipped.",
  ].join("\n");
}

function parseArguments(argv) {
  let root = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      return { help: true, root: null };
    }

    if (argument === "--root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--root requires a directory path.\n\n" + usage());
      }
      if (root !== null) {
        throw new Error("--root may be specified only once.");
      }
      root = path.resolve(process.cwd(), value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
  }

  return { help: false, root };
}

function hasProjectMarker(directory) {
  return ["package.json", ".git"].some((name) => {
    try {
      fs.accessSync(path.join(directory, name));
      return true;
    } catch {
      return false;
    }
  });
}

function findDefaultRoot() {
  let directory = path.resolve(__dirname);

  while (true) {
    if (hasProjectMarker(directory)) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }

  // Preserve the original script's default for projects without a package/.git marker.
  return path.resolve(__dirname, "..");
}

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function collectSourceFiles(root, files, scanErrors) {
  const pendingDirectories = [root];

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop();
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      scanErrors.push({ path: directory, error });
      continue;
    }

    entries.sort((left, right) => compareNames(left.name, right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;

      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(fullPath);
        continue;
      }

      // Symlinks are deliberately not followed, avoiding cycles and scans outside root.
      if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }
}

function displayPath(root, filePath) {
  const relative = path.relative(root, filePath);
  return relative || path.basename(filePath);
}

function diagnosticText(result) {
  if (result.error) {
    return `Could not launch Node's syntax parser: ${result.error.message}`;
  }

  const output = [result.stderr, result.stdout]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n")
    .trim();

  if (!output) {
    if (result.signal) return `Node exited after receiving signal ${result.signal}.`;
    return `Node exited with status ${result.status ?? "unknown"} and no diagnostic output.`;
  }
  if (output.length <= MAX_DIAGNOSTIC_CHARS) return output;
  return `${output.slice(0, MAX_DIAGNOSTIC_CHARS)}\n… diagnostic truncated …`;
}

function checkFile(filePath) {
  try {
    return spawnSync(process.execPath, ["--check", filePath], {
      encoding: "utf8",
      timeout: CHILD_TIMEOUT_MS,
      maxBuffer: CHILD_MAX_BUFFER_BYTES,
      windowsHide: true,
    });
  } catch (error) {
    return { status: null, error, stderr: "", stdout: "", signal: null };
  }
}

function run() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const root = options.root || findDefaultRoot();
  let rootStats;
  try {
    rootStats = fs.statSync(root);
  } catch (error) {
    process.stderr.write(`Cannot access scan root "${root}": ${error.message}\n`);
    return 2;
  }
  if (!rootStats.isDirectory()) {
    process.stderr.write(`Scan root is not a directory: "${root}"\n`);
    return 2;
  }

  const files = [];
  const scanErrors = [];
  collectSourceFiles(root, files, scanErrors);
  files.sort((left, right) => compareNames(displayPath(root, left), displayPath(root, right)));

  for (const item of scanErrors) {
    process.stderr.write(`SCAN ERROR ${displayPath(root, item.path)}\n${item.error.message}\n`);
  }

  if (files.length === 0) {
    process.stderr.write("No .js, .mjs, or .cjs files found; syntax check cannot pass.\n");
    return scanErrors.length > 0 ? 1 : 2;
  }

  let syntaxFailures = 0;
  let executionErrors = 0;
  for (const filePath of files) {
    const result = checkFile(filePath);
    if (result.error || result.status !== 0) {
      if (result.error || result.status === null) executionErrors += 1;
      else syntaxFailures += 1;
      const label = result.error || result.status === null ? "ERROR" : "FAIL";
      process.stderr.write(`${label} ${displayPath(root, filePath)}\n`);
      process.stderr.write(`${diagnosticText(result)}\n`);
    }
  }

  if (syntaxFailures > 0 || executionErrors > 0 || scanErrors.length > 0) {
    process.stderr.write(
      `Syntax check did not pass: ${syntaxFailures} syntax failure(s), ` +
        `${executionErrors} execution error(s), ${scanErrors.length} scan error(s) ` +
        `across ${files.length} source file(s).\n`,
    );
    return 1;
  }

  process.stdout.write(`PASS syntax check: ${files.length} source file(s).\n`);
  return 0;
}

try {
  process.exitCode = run();
} catch (error) {
  process.stderr.write(`Syntax checker could not complete: ${error.stack || error.message}\n`);
  process.exitCode = 2;
}

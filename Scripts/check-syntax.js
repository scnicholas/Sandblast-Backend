#!/usr/bin/env node
"use strict";

// Validate active .js/.mjs/.cjs source with the current Node.js parser.
// This performs syntax checking only: source files are never executed or imported.
// Archived certified baselines and backup directories are opt-in.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);
const ARCHIVE_DIRECTORIES = new Set(["_certified_baselines", "certified_baselines"]);
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_TIMEOUT_MS = 90_000;
const CHILD_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const MAX_DIAGNOSTIC_CHARS = 12_000;

function usage() {
  return [
    "Usage: node check-syntax.js [--root <directory>] [--include-backups]",
    "                            [--include-archives] [--timeout-ms <milliseconds>] [--help]",
    "",
    "Checks active .js, .mjs and .cjs files recursively with Node's syntax parser.",
    "Uses the nearest package.json/.git ancestor, or the script's parent if none exists.",
    "Always skips .git, node_modules and symbolic links.",
    "By default, skips backup-, backup_, backup. directories, and archived",
    "_certified_baselines/certified_baselines trees (including their snapshots).",
    "--include-backups  Include named backup directories.",
    "--include-archives Include certified baseline archive directories.",
    "--timeout-ms N    Per-file parser timeout (default: 30000; max: 300000).",
    "Timeouts are retried once with a larger allowance; unresolved timeouts fail the check.",
  ].join("\n");
}

function parseArguments(argv) {
  let root = null;
  let includeBackups = false;
  let includeArchives = false;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true, root, includeBackups, includeArchives, timeoutMs };
    }
    if (argument === "--include-backups") { includeBackups = true; continue; }
    if (argument === "--include-archives") { includeArchives = true; continue; }
    if (argument === "--root") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--root requires a directory path.\n\n" + usage());
      if (root !== null) throw new Error("--root may be specified only once.");
      root = path.resolve(process.cwd(), value);
      continue;
    }
    if (argument === "--timeout-ms") {
      const value = argv[++index];
      if (!value || !/^[0-9]+$/.test(value)) throw new Error("--timeout-ms requires an integer from 1000 to 300000.");
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 1000 || parsed > 300000) {
        throw new Error("--timeout-ms requires an integer from 1000 to 300000.");
      }
      timeoutMs = parsed;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
  }
  return { help: false, root, includeBackups, includeArchives, timeoutMs };
}

function hasProjectMarker(directory) {
  return ["package.json", ".git"].some(name => {
    try { fs.accessSync(path.join(directory, name)); return true; }
    catch (_) { return false; }
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
  return path.resolve(__dirname, "..");
}

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isBackupDirectory(name) {
  return /^backup(?:[-_.])/i.test(name);
}

function collectSourceFiles(root, files, scanErrors, options) {
  const pendingDirectories = [root];
  const skipped = { backups: 0, archives: 0, dependencies: 0, symlinks: 0 };
  while (pendingDirectories.length) {
    const directory = pendingDirectories.pop();
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch (error) { scanErrors.push({ path: directory, error }); continue; }
    entries.sort((a, b) => compareNames(a.name, b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) { skipped.symlinks += 1; continue; }
      if (entry.isDirectory()) {
        const normalizedName = entry.name.toLowerCase();
        if (IGNORED_DIRECTORIES.has(normalizedName)) { skipped.dependencies += 1; continue; }
        if (!options.includeArchives && ARCHIVE_DIRECTORIES.has(normalizedName)) {
          skipped.archives += 1; continue;
        }
        if (!options.includeBackups && isBackupDirectory(entry.name)) {
          skipped.backups += 1; continue;
        }
        pendingDirectories.push(path.join(directory, entry.name));
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(path.join(directory, entry.name));
      }
    }
  }
  return skipped;
}

function displayPath(root, filePath) {
  return path.relative(root, filePath) || path.basename(filePath);
}

function diagnosticText(result) {
  const output = [result.stderr, result.stdout]
    .filter(value => typeof value === "string" && value.trim()).join("\n").trim();
  const error = result.error && result.error.message ? result.error.message : "";
  const message = error ? `Could not complete Node's syntax parser: ${error}${output ? `\n${output}` : ""}` :
    output || (result.signal ? `Node exited after signal ${result.signal}.` :
      `Node exited with status ${result.status === null ? "unknown" : result.status} and no diagnostics.`);
  return message.length <= MAX_DIAGNOSTIC_CHARS ? message :
    `${message.slice(0, MAX_DIAGNOSTIC_CHARS)}\n… diagnostic truncated …`;
}

function checkFile(filePath, timeoutMs) {
  try {
    return spawnSync(process.execPath, ["--check", filePath], {
      encoding: "utf8", timeout: timeoutMs,
      maxBuffer: CHILD_MAX_BUFFER_BYTES, windowsHide: true,
    });
  } catch (error) {
    return { status: null, error, stderr: "", stdout: "", signal: null };
  }
}

function isTimeout(result) {
  return Boolean(result && result.error && result.error.code === "ETIMEDOUT");
}

function run() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { process.stdout.write(usage() + "\n"); return 0; }
  const root = options.root || findDefaultRoot();
  let stats;
  try { stats = fs.statSync(root); }
  catch (error) { process.stderr.write(`Cannot access scan root "${root}": ${error.message}\n`); return 2; }
  if (!stats.isDirectory()) { process.stderr.write(`Scan root is not a directory: "${root}"\n`); return 2; }

  const files = [];
  const scanErrors = [];
  const skipped = collectSourceFiles(root, files, scanErrors, options);
  files.sort((a, b) => compareNames(displayPath(root, a), displayPath(root, b)));
  for (const item of scanErrors) {
    process.stderr.write(`SCAN ERROR ${displayPath(root, item.path)}\n${item.error.message}\n`);
  }
  if (!files.length) {
    process.stderr.write("No active .js, .mjs or .cjs files found; syntax check cannot pass.\n");
    return scanErrors.length ? 1 : 2;
  }

  let syntaxFailures = 0;
  let executionErrors = 0;
  let timeoutRetries = 0;
  for (const filePath of files) {
    let result = checkFile(filePath, options.timeoutMs);
    if (isTimeout(result)) {
      timeoutRetries += 1;
      const retryMs = Math.min(300_000, Math.max(RETRY_TIMEOUT_MS, options.timeoutMs * 2));
      process.stderr.write(`RETRY TIMEOUT ${displayPath(root, filePath)} (retry limit ${retryMs} ms)\n`);
      result = checkFile(filePath, retryMs);
    }
    if (result.error || result.status !== 0) {
      // Parser startup failures, timeouts and signals are execution errors, never syntax errors.
      const executionError = Boolean(result.error || result.status === null || result.signal);
      if (executionError) executionErrors += 1;
      else syntaxFailures += 1;
      process.stderr.write(`${executionError ? "ERROR" : "FAIL"} ${displayPath(root, filePath)}\n`);
      process.stderr.write(diagnosticText(result) + "\n");
    }
  }

  const summary = `${syntaxFailures} syntax failure(s), ${executionErrors} execution error(s), ` +
    `${scanErrors.length} scan error(s) across ${files.length} active source file(s); ` +
    `skipped ${skipped.archives} archive director${skipped.archives === 1 ? "y" : "ies"}, ` +
    `${skipped.backups} backup director${skipped.backups === 1 ? "y" : "ies"}; ` +
    `${timeoutRetries} timeout retr${timeoutRetries === 1 ? "y" : "ies"}.`;
  if (syntaxFailures || executionErrors || scanErrors.length) {
    process.stderr.write(`Syntax check did not pass: ${summary}\n`);
    return 1;
  }
  process.stdout.write(`PASS syntax check: ${summary}\n`);
  return 0;
}

try { process.exitCode = run(); }
catch (error) {
  process.stderr.write(`Syntax checker could not complete: ${error && (error.stack || error.message) || error}\n`);
  process.exitCode = 2;
}

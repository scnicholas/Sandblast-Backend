"use strict";

/**
 * find-syntax-risk-files.js
 *
 * Run from the Sandblast backend root:
 *   node tools/find-syntax-risk-files.js
 *
 * Scans JavaScript and JSON without executing project modules.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const REPORT_PATH = path.join(
  ROOT,
  "syntax-risk-report.json"
);

const EXCLUDED_DIRECTORIES = new Set([
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
  /^old(?:[-_.]|$)/i,
  /^deprecated(?:[-_.]|$)/i
];

const MERGE_MARKER_PATTERN =
  /^(?:<<<<<<<|=======|>>>>>>>)(?:\s|$)/m;

function excludedDirectory(name) {
  return (
    EXCLUDED_DIRECTORIES.has(name) ||
    EXCLUDED_DIRECTORY_PATTERNS.some(
      (pattern) => pattern.test(name)
    )
  );
}

function walk(directory, output = []) {
  let entries = [];

  try {
    entries = fs.readdirSync(
      directory,
      { withFileTypes: true }
    );
  } catch (_) {
    return output;
  }

  for (const entry of entries) {
    const fullPath = path.join(
      directory,
      entry.name
    );

    if (entry.isDirectory()) {
      if (!excludedDirectory(entry.name)) {
        walk(fullPath, output);
      }
      continue;
    }

    if (!entry.isFile()) continue;

    if (
      /\.(?:js|cjs|mjs|json)$/i.test(entry.name)
    ) {
      output.push(fullPath);
    }
  }

  return output;
}

function relative(filePath) {
  return path
    .relative(ROOT, filePath)
    .split(path.sep)
    .join("/");
}

function checkJavaScript(filePath) {
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
    stderr: String(result.stderr || "").trim(),
    stdout: String(result.stdout || "").trim(),
    error:
      result.error &&
      String(result.error.message || result.error)
  };
}

function checkJson(filePath, text) {
  try {
    JSON.parse(text.replace(/^\uFEFF/, ""));
    return {
      ok: true,
      error: ""
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error.message || error)
    };
  }
}

function main() {
  const files = walk(ROOT);
  const risks = [];

  for (const filePath of files) {
    const file = relative(filePath);
    let text = "";

    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      risks.push({
        file,
        type: "read_failure",
        detail: String(error.message || error)
      });
      continue;
    }

    if (MERGE_MARKER_PATTERN.test(text)) {
      risks.push({
        file,
        type: "unresolved_git_conflict",
        detail: "Contains <<<<<<<, =======, or >>>>>>>."
      });
    }

    if (/\.json$/i.test(filePath)) {
      const json = checkJson(filePath, text);
      if (!json.ok) {
        risks.push({
          file,
          type: "invalid_json",
          detail: json.error
        });
      }
      continue;
    }

    const syntax = checkJavaScript(filePath);

    if (!syntax.ok) {
      let jsonStoredAsJs = false;

      try {
        JSON.parse(text.replace(/^\uFEFF/, ""));
        jsonStoredAsJs = true;
      } catch (_) {}

      risks.push({
        file,
        type:
          jsonStoredAsJs
            ? "json_stored_as_javascript"
            : "javascript_syntax_error",
        detail:
          syntax.stderr ||
          syntax.stdout ||
          syntax.error ||
          "node --check failed"
      });
    }
  }

  const report = {
    ok: risks.length === 0,
    root: ROOT,
    scanned: files.length,
    risksFound: risks.length,
    risks
  };

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log(
    JSON.stringify(report, null, 2)
  );
  console.log(
    `\nReport written to: ${REPORT_PATH}`
  );

  process.exitCode = report.ok ? 0 : 1;
}

main();

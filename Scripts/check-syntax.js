"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const files = [];

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }
}

collect(root);
files.sort();
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failures += 1;
    process.stderr.write(`FAIL ${path.relative(root, file)}\n${result.stderr || result.error || "syntax check failed"}\n`);
  }
}

if (failures) {
  process.stderr.write(`Syntax check failed: ${failures}/${files.length} JavaScript files.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS syntax check: ${files.length}/${files.length} JavaScript files.\n`);
}

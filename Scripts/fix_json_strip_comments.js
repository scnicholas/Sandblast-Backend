"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Strips ONLY block comments (/* ... * /) and line comments (// ...)
 * while preserving content inside JSON strings.
 * Output is valid JSON (assuming the remaining content is valid).
 */

function stripJsonComments(input) {
  let out = "";
  let i = 0;

  let inString = false;
  let stringQuote = '"';
  let escape = false;

  while (i < input.length) {
    const c = input[i];
    const n = input[i + 1];

    if (inString) {
      out += c;
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === stringQuote) {
        inString = false;
      }
      i += 1;
      continue;
    }

    // Enter string
    if (c === '"' || c === "'") {
      inString = true;
      stringQuote = c;
      out += c;
      i += 1;
      continue;
    }

    // Block comment /* ... */
    if (c === "/" && n === "*") {
      i += 2;
      while (i < input.length) {
        if (input[i] === "*" && input[i + 1] === "/") {
          i += 2;
          break;
        }
        i += 1;
      }
      continue;
    }

    // Line comment // ...
    if (c === "/" && n === "/") {
      i += 2;
      while (i < input.length && input[i] !== "\n") i += 1;
      continue;
    }

    out += c;
    i += 1;
  }

  return out;
}

function fixFile(fp) {
  const raw = fs.readFileSync(fp, "utf8");
  const stripped = stripJsonComments(raw);

  // Validate JSON
  JSON.parse(stripped);

  // Write back (pretty-print optional)
  fs.writeFileSync(fp, JSON.stringify(JSON.parse(stripped)), "utf8");
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node Scripts/fix_json_strip_comments.js Data/music_moments_v1.json");
  process.exit(1);
}

const fp = path.resolve(process.cwd(), file);
fixFile(fp);
console.log("OK:", fp);

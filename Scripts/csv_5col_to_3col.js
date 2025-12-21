"use strict";

const fs = require("fs");

function parseCsvLine(line) {
  const vals = [];
  let cur = "";
  let q = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        q = !q;
      }
    } else if (ch === "," && !q) {
      vals.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  vals.push(cur);
  return vals;
}

function csvEscape(s) {
  s = String(s ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const inP = process.argv[2] || "./Data/top40weekly_1970_1975.csv";
const outP = process.argv[3] || "./Data/top40weekly_1970_1975_3col.csv";

const raw = fs.readFileSync(inP, "utf8").replace(/\r/g, "");
const lines = raw.split("\n").filter(Boolean);

if (lines.length < 2) {
  console.error("[ERR] Input CSV empty or missing rows:", inP);
  process.exit(1);
}

const header = lines[0].trim();
if (header !== "year,rank,artist,title,chart") {
  console.error("[ERR] Unexpected header:", header);
  console.error("Expected: year,rank,artist,title,chart");
  process.exit(1);
}

const out = ["year,artist,title"];
let kept = 0;

for (let i = 1; i < lines.length; i++) {
  const vals = parseCsvLine(lines[i]);
  const year = (vals[0] || "").trim();
  const artist = (vals[2] || "").trim();
  const title = (vals[3] || "").trim();

  if (!year || !artist || !title) continue;

  out.push([csvEscape(year), csvEscape(artist), csvEscape(title)].join(","));
  kept++;
}

fs.writeFileSync(outP, out.join("\n") + "\n", "utf8");
console.log("[DONE] wrote", kept, "rows");
console.log("[OUT]", outP);

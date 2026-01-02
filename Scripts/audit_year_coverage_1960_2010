const fs = require("fs");
const path = require("path");

const files = [
  "Data/wikipedia/billboard_yearend_hot100_1970_2010.json",
  "Data/wikipedia/billboard_yearend_singles_1950_1959.json",
  "Data/music_moments_v2_layer2_plus500.json",
  "Data/music_moments_v2_layer2.json",
  "Data/music_moments_v2.json",
  "Data/music_moments.json",
];

function loadJson(p) {
  try {
    const abs = path.resolve(process.cwd(), p);
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

function getRows(doc) {
  if (!doc) return [];
  if (Array.isArray(doc.rows)) return doc.rows;
  if (Array.isArray(doc.moments)) return doc.moments;
  if (Array.isArray(doc)) return doc;
  return [];
}

function yearFrom(x) {
  const s = String(x ?? "").match(/\b(19|20)\d{2}\b/);
  return s ? Number(s[0]) : null;
}

const yearHits = {};
for (let y = 1960; y <= 2010; y++) yearHits[y] = [];

for (const f of files) {
  const doc = loadJson(f);
  const rows = getRows(doc);
  if (!rows.length) continue;

  for (const r of rows) {
    const y = yearFrom(r.year);
    if (!y || y < 1960 || y > 2010) continue;
    yearHits[y].push(f);
  }
}

let missing = [];
for (let y = 1960; y <= 2010; y++) {
  const sources = Array.from(new Set(yearHits[y]));
  if (!sources.length) missing.push(y);
}

console.log("=== YEAR COVERAGE AUDIT (1960–2010) ===");
console.log("Missing years count:", missing.length);
if (missing.length) console.log("Missing years:", missing.join(", "));
console.log("\nSample coverage:");
for (const y of [1960, 1965, 1969, 1970, 1984, 1999, 2010]) {
  const sources = Array.from(new Set(yearHits[y]));
  console.log(y, "=>", sources.length ? sources : "(none)");
}

"use strict";

const fs = require("fs");
const path = require("path");

function die(msg) {
  console.error("[ERR]", msg);
  process.exit(1);
}

// --- BOM-safe JSON reader ---
function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  const clean = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  return JSON.parse(clean);
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function getMomentsContainer(json) {
  if (Array.isArray(json)) return { moments: json, wrapper: null };
  if (json && Array.isArray(json.moments)) return { moments: json.moments, wrapper: json };
  die("Input JSON must be either [] or { moments: [] }");
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\w\s#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- CHART-AGNOSTIC KEY (artist + title + year) ---
function keyOf(m) {
  return `${norm(m.artist)}||${norm(m.title)}||${String(m.year || "")}`;
}

(function main() {
  const inPath = process.argv[2];
  const rulesPath = process.argv[3];
  const outPath = process.argv[4];

  if (!inPath || !rulesPath || !outPath) {
    die("Usage: node scripts/enrich_moments_from_rules.js <in.json> <rules.json> <out.json>");
  }

  const inAbs = path.resolve(process.cwd(), inPath);
  const rulesAbs = path.resolve(process.cwd(), rulesPath);
  const outAbs = path.resolve(process.cwd(), outPath);

  if (!fs.existsSync(inAbs)) die("Input not found: " + inAbs);
  if (!fs.existsSync(rulesAbs)) die("Rules not found: " + rulesAbs);

  const db = readJson(inAbs);
  const { moments, wrapper } = getMomentsContainer(db);
  const rules = readJson(rulesAbs);

  // rules: { items: [ {artist,title,year, culture,fact,next,tags,aka, force} ] }
  const items = Array.isArray(rules.items) ? rules.items : [];
  const ruleMap = new Map();

  for (const r of items) {
    const tmp = {
      artist: r.artist,
      title: r.title,
      year: r.year
    };
    ruleMap.set(keyOf(tmp), r);
  }

  let enriched = 0;

  for (const m of moments) {
    const r = ruleMap.get(keyOf(m));
    if (!r) continue;

    const force = !!r.force;

    const culture = r.culture || r.cultural_moment;
    const fact = r.fact || r.chart_fact;
    const next = r.next || r.next_step;

    if ((force || !m.culture) && culture) m.culture = culture;
    if ((force || !m.fact) && fact) m.fact = fact;
    if ((force || !m.next) && next) m.next = next;

    if (Array.isArray(r.tags) && r.tags.length) {
      const existing = Array.isArray(m.tags) ? m.tags : [];
      m.tags = [...new Set([...existing, ...r.tags])];
    }

    if (Array.isArray(r.aka) && r.aka.length) {
      const existing = Array.isArray(m.aka) ? m.aka : [];
      m.aka = [...new Set([...existing, ...r.aka])];
    }

    enriched++;
  }

  if (wrapper) writeJson(outAbs, wrapper);
  else writeJson(outAbs, moments);

  console.error(`[DONE] enriched=${enriched}, totalNow=${moments.length}`);
  console.error(`[OUT] ${outAbs}`);
})();

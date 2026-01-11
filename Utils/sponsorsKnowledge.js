"use strict";

/**
 * Utils/sponsorsKnowledge.js
 *
 * Purpose:
 *  - Load Data/sponsors/sponsors_catalog_v1.json
 *  - Provide normalized helpers for categories, tiers/packages, CTAs, restrictions
 *  - Provide a simple recommender scaffold (tier/package + bundle suggestion)
 *
 * Option A Update (catalog load reliability + better diagnostics):
 *  1) ENV override precedence fixed:
 *      - If SPONSORS_CATALOG_PATH is set, it overrides DEFAULT unless an explicit relPath is passed.
 *      - Previously, relPath could unintentionally override env even when empty-ish.
 *  2) findCatalogPath now tests BOTH:
 *      - the explicit relPath
 *      - the env override path (absolute or relative)
 *     and returns the first match.
 *  3) Adds richer load error info:
 *      - candidates list (where we looked)
 *      - lastErr if read/parse fails
 *  4) Adds getCatalogStatus(): small, safe status object for debugging in /api/health or /api/chat?debug=1.
 *  5) Keeps callers safe: never throws outward.
 *
 * Design notes:
 *  - No external deps
 *  - Safe file loading with cwd-relative fallback
 *  - Pure functions where possible
 *  - Small, defensive normalization: never throw in callers
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_CATALOG_REL = "Data/sponsors/sponsors_catalog_v1.json";
const ENV_CATALOG_PATH = "SPONSORS_CATALOG_PATH"; // optional override

let _cache = {
  loaded: false,
  rel: DEFAULT_CATALOG_REL,
  abs: null,
  catalog: null,
  error: null,
  mtimeMs: 0,
  loadedAt: 0,
  candidates: [],
  lastErr: null,
};

function nowIso() {
  return new Date().toISOString();
}

function cleanText(s) {
  return String(s || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJsonParse(s) {
  try {
    return JSON.parse(String(s || ""));
  } catch {
    return null;
  }
}

function tryReadJsonFile(absPath) {
  const raw = fs.readFileSync(absPath, "utf8");
  const j = safeJsonParse(raw);
  if (!j || typeof j !== "object") throw new Error("Invalid JSON");
  const st = fs.statSync(absPath);
  return { json: j, mtimeMs: Number(st.mtimeMs || 0) };
}

function asBool(v, fallback) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const t = cleanText(v).toLowerCase();
  if (!t) return !!fallback;
  if (t === "true" || t === "yes" || t === "1") return true;
  if (t === "false" || t === "no" || t === "0") return false;
  return !!fallback;
}

function pickFirstNonEmpty(arr, fallback) {
  for (const v of arr) {
    const t = cleanText(v);
    if (t) return t;
  }
  return fallback;
}

/**
 * Normalized token helper (shared across modules)
 */
function normToken(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_");
}

function fileExists(abs) {
  try {
    return !!abs && fs.existsSync(abs);
  } catch {
    return false;
  }
}

/**
 * Build candidate absolute paths for a given rel (or abs) string.
 * Returns { candidates: string[] }
 */
function buildCandidates(maybePath) {
  const p = cleanText(maybePath || "");
  const out = [];

  if (!p) return { candidates: out };

  // Absolute path direct
  try {
    if (path.isAbsolute(p)) {
      return { candidates: [p] };
    }
  } catch {
    // ignore
  }

  const rel = String(p).replace(/^\/+/, "");

  // 1) cwd-relative
  out.push(path.join(process.cwd(), rel));

  // 2) relative to this file (../Data/... from Utils/)
  out.push(path.join(__dirname, "..", rel));

  // 3) relative to project root guess (/src)
  out.push(path.join(process.cwd(), "src", rel));

  return { candidates: out };
}

/**
 * Find the catalog path.
 * Precedence:
 *  - If relPath is a real value, try it first
 *  - Else if ENV override exists, try it
 *  - Else default
 *
 * We also test BOTH relPath and env path (when both exist), in a deterministic order.
 */
function findCatalogPath(relPath) {
  const env = cleanText(process.env[ENV_CATALOG_PATH] || "");
  const rel = cleanText(relPath || "");

  // Determine search order
  const searchList = [];
  if (rel) searchList.push(rel);
  if (env && env !== rel) searchList.push(env);
  if (DEFAULT_CATALOG_REL !== rel && DEFAULT_CATALOG_REL !== env) searchList.push(DEFAULT_CATALOG_REL);
  if (!searchList.length) searchList.push(DEFAULT_CATALOG_REL);

  const candidates = [];
  for (const item of searchList) {
    const built = buildCandidates(item);
    for (const c of built.candidates) candidates.push(c);
  }

  // De-dup while preserving order
  const seen = new Set();
  const uniq = [];
  for (const c of candidates) {
    const key = String(c || "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(key);
  }

  // Save candidates for diagnostics (last attempt)
  _cache.candidates = uniq;

  for (const abs of uniq) {
    if (fileExists(abs)) return abs;
  }

  return null;
}

/* ======================================================
   Normalizers
====================================================== */

function normalizeTier(t) {
  const obj = t && typeof t === "object" ? t : {};
  const id = normToken(obj.id);
  if (!id) return null;

  const label = cleanText(obj.label || obj.name || obj.id);
  const price_range = obj.price_range && typeof obj.price_range === "object" ? obj.price_range : null;

  const includes = Array.isArray(obj.includes) ? obj.includes.map(cleanText).filter(Boolean) : [];
  const frequency_hint = cleanText(obj.frequency_hint || obj.frequency || "");

  return {
    id,
    label,
    price_range,
    includes,
    frequency_hint: frequency_hint || null,
  };
}

function normalizePackage(p) {
  const obj = p && typeof p === "object" ? p : {};
  const id = normToken(obj.id);
  if (!id) return null;

  const name = cleanText(obj.name || obj.label || obj.id);
  const channels = Array.isArray(obj.channels) ? obj.channels.map(normToken).filter(Boolean) : [];
  const bestFor = Array.isArray(obj.bestFor) ? obj.bestFor.map(cleanText).filter(Boolean) : [];
  const includes = Array.isArray(obj.includes) ? obj.includes.map(cleanText).filter(Boolean) : [];
  const priceRange = cleanText(obj.priceRange || obj.price_range || "");

  return {
    id,
    name,
    channels,
    bestFor,
    includes,
    priceRange: priceRange || null,
  };
}

function normalizeCatalog(cat) {
  const catalog = cat && typeof cat === "object" ? cat : {};

  const currency = cleanText(catalog.currency || "CAD") || "CAD";
  const updated = cleanText(catalog.updated || nowIso());

  // Properties: allow yes/no flags, but default all true
  const propsIn = catalog.properties && typeof catalog.properties === "object" ? catalog.properties : {};
  const properties = {
    tv: asBool(propsIn.tv, true),
    radio: asBool(propsIn.radio, true),
    website: asBool(propsIn.website, true),
    social: asBool(propsIn.social, true),
  };

  // Tiers normalized + dedup by id (optional in your JSON)
  const tiersRaw = Array.isArray(catalog.tiers) ? catalog.tiers : [];
  const tiersNorm = [];
  const seenTier = new Set();
  for (const tr of tiersRaw) {
    const nt = normalizeTier(tr);
    if (!nt) continue;
    if (seenTier.has(nt.id)) continue;
    seenTier.add(nt.id);
    tiersNorm.push(nt);
  }

  // Packages normalized + dedup by id (your sponsors_catalog_v1.json uses packages)
  const pkgsRaw = Array.isArray(catalog.packages) ? catalog.packages : [];
  const packagesNorm = [];
  const seenPkg = new Set();
  for (const pr of pkgsRaw) {
    const np = normalizePackage(pr);
    if (!np) continue;
    if (seenPkg.has(np.id)) continue;
    seenPkg.add(np.id);
    packagesNorm.push(np);
  }

  // CTAs normalized (optional)
  const ctAs = catalog.ctas && typeof catalog.ctas === "object" ? catalog.ctas : {};
  const ctas = {
    primary: cleanText(ctAs.primary || "book_a_call") || "book_a_call",
    options: Array.isArray(ctAs.options) ? ctAs.options.map(cleanText).filter(Boolean) : [],
    ...ctAs,
  };

  // Restrictions normalized (optional)
  const restrictionsIn = catalog.restrictions && typeof catalog.restrictions === "object" ? catalog.restrictions : {};
  const restrictions = {
    restricted_categories: Array.isArray(restrictionsIn.restricted_categories)
      ? restrictionsIn.restricted_categories.map(cleanText).filter(Boolean)
      : [],
    notes: cleanText(restrictionsIn.notes || ""),
    ...restrictionsIn,
  };

  // Categories normalized (object map recommended)
  const categories = catalog.categories && typeof catalog.categories === "object" ? catalog.categories : {};

  // Lane prompts (optional)
  const nyx_lane_prompts =
    catalog.nyx_lane_prompts && typeof catalog.nyx_lane_prompts === "object" ? catalog.nyx_lane_prompts : {};

  // Defaults (optional)
  const defaultsIn = catalog.defaults && typeof catalog.defaults === "object" ? catalog.defaults : {};
  const defaults = {
    currency: cleanText(defaultsIn.currency || currency) || currency,
    cta: cleanText(defaultsIn.cta || ctas.primary) || ctas.primary,
    // Prefer a package/tier-like default if present; else "growth_bundle" / "growth"
    tier: normToken(defaultsIn.tier || "growth_bundle") || "growth_bundle",
    ...defaultsIn,
  };

  return {
    version: cleanText(catalog.version || "sponsors_catalog_v1"),
    updated,
    currency,
    properties,
    tiers: tiersNorm, // optional legacy path
    packages: packagesNorm, // canonical path for v1
    categories,
    restrictions,
    ctas,
    defaults,
    nyx_lane_prompts,
  };
}

/* ======================================================
   Load / Cache
====================================================== */

/**
 * Load catalog (cached). If file changes on disk, reload.
 * Precedence:
 *  - If relPath is provided and non-empty, it is tried first.
 *  - Else env override (if set).
 *  - Else default.
 */
function loadCatalog(relPath) {
  const requested = cleanText(relPath || "");
  const env = cleanText(process.env[ENV_CATALOG_PATH] || "");
  const effectiveRel = requested || env || DEFAULT_CATALOG_REL;

  // Find path considering BOTH requested and env and default (deterministic order)
  const abs = findCatalogPath(effectiveRel);

  if (!abs) {
    const relShown = effectiveRel.replace(/^\/+/, "");
    _cache = {
      loaded: false,
      rel: relShown,
      abs: null,
      catalog: null,
      error: `CATALOG_NOT_FOUND: ${relShown}`,
      mtimeMs: 0,
      loadedAt: 0,
      candidates: Array.isArray(_cache.candidates) ? _cache.candidates : [],
      lastErr: null,
    };
    return { ok: false, error: _cache.error, rel: relShown, abs: null, catalog: null, candidates: _cache.candidates };
  }

  try {
    const st = fs.statSync(abs);
    const mtimeMs = Number(st.mtimeMs || 0);

    if (_cache.loaded && _cache.abs === abs && _cache.mtimeMs === mtimeMs && _cache.catalog) {
      return { ok: true, rel: _cache.rel, abs, catalog: _cache.catalog };
    }

    const { json, mtimeMs: newMtime } = tryReadJsonFile(abs);
    const catalog = normalizeCatalog(json);

    _cache = {
      loaded: true,
      rel: effectiveRel.replace(/^\/+/, ""),
      abs,
      catalog,
      error: null,
      mtimeMs: newMtime,
      loadedAt: Date.now(),
      candidates: Array.isArray(_cache.candidates) ? _cache.candidates : [],
      lastErr: null,
    };

    return { ok: true, rel: _cache.rel, abs, catalog };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    _cache = {
      loaded: false,
      rel: effectiveRel.replace(/^\/+/, ""),
      abs,
      catalog: null,
      error: `CATALOG_READ_ERROR: ${msg}`,
      mtimeMs: 0,
      loadedAt: 0,
      candidates: Array.isArray(_cache.candidates) ? _cache.candidates : [],
      lastErr: msg,
    };
    return {
      ok: false,
      error: _cache.error,
      rel: _cache.rel,
      abs,
      catalog: null,
      candidates: _cache.candidates,
      lastErr: _cache.lastErr,
    };
  }
}

/**
 * Return cached catalog (auto-load default if needed).
 */
function getCatalog() {
  if (_cache.loaded && _cache.catalog) return _cache.catalog;
  const out = loadCatalog(DEFAULT_CATALOG_REL);
  return out.ok ? out.catalog : null;
}

function getCatalogMeta() {
  const c = getCatalog();
  if (!c) return null;

  const tiers = (c.tiers || []).map((t) => ({ id: t.id, label: t.label, price_range: t.price_range || null }));
  const packages = (c.packages || []).map((p) => ({
    id: p.id,
    name: p.name,
    channels: p.channels || [],
    priceRange: p.priceRange || null,
  }));

  return {
    version: c.version,
    updated: c.updated,
    currency: c.currency,
    properties: c.properties,
    tiers,
    packages,
  };
}

function getProperties() {
  const cat = getCatalog();
  if (!cat) return { tv: true, radio: true, website: true, social: true };
  return cat.properties || { tv: true, radio: true, website: true, social: true };
}

/**
 * Small, safe diagnostic snapshot for debug/health.
 * Does not include the full catalog payload.
 */
function getCatalogStatus() {
  return {
    ok: !!(_cache.loaded && _cache.catalog),
    rel: _cache.rel || null,
    abs: _cache.abs || null,
    error: _cache.error || null,
    mtimeMs: _cache.mtimeMs || 0,
    loadedAt: _cache.loadedAt || 0,
    candidates: Array.isArray(_cache.candidates) ? _cache.candidates.slice(0, 10) : [],
    lastErr: _cache.lastErr || null,
  };
}

/* ======================================================
   Category / Package helpers
====================================================== */

function listCategoryIds(catalogMaybe) {
  const cat = catalogMaybe || getCatalog();
  if (!cat) return [];
  return Object.keys(cat.categories || {})
    .map((k) => cleanText(k))
    .filter(Boolean);
}

function getCategory(catalogMaybe, categoryId) {
  const cat = catalogMaybe || getCatalog();
  if (!cat) return null;

  const wanted = normToken(categoryId);
  if (!wanted) return null;

  const obj = cat.categories || {};
  if (obj[wanted]) return obj[wanted];

  const hitKey = Object.keys(obj).find((k) => normToken(k) === wanted);
  return hitKey ? obj[hitKey] : null;
}

function getCategoryById(categoryId) {
  const cat = getCatalog();
  if (!cat) return null;

  const id = normToken(categoryId);
  const obj = cat.categories || {};
  const hitKey = Object.keys(obj).find((k) => normToken(k) === id);
  if (!hitKey) return null;

  const v = obj[hitKey];
  if (v && typeof v === "object") return { id: hitKey, ...v };
  return { id: hitKey, label: cleanText(String(v || hitKey)) };
}

function getPackageById(catalogMaybe, packageId) {
  const cat = catalogMaybe || getCatalog();
  if (!cat) return null;

  const pid = normToken(packageId);
  if (!pid) return null;

  const pkgs = Array.isArray(cat.packages) ? cat.packages : [];
  return pkgs.find((p) => normToken(p.id) === pid) || null;
}

/**
 * Recommend *package ids* given category + budgetTier.
 * - budgetTier wins if explicit (starter_test/growth_bundle/dominance)
 * - else category.recommended from catalog if present
 * - else fallback ["growth"]
 */
function recommendPackageIds(catalogMaybe, categoryId, budgetTier) {
  const cat = catalogMaybe || getCatalog();
  if (!cat) return ["growth"];

  const bt = normToken(budgetTier);

  if (bt === "starter_test" || bt === "starter") return ["starter"];
  if (bt === "growth_bundle" || bt === "growth") return ["growth"];
  if (bt === "dominance") return ["dominance"];

  const c = getCategory(cat, categoryId);
  const rec = c && typeof c === "object" && Array.isArray(c.recommended) ? c.recommended : null;
  if (rec && rec.length) return rec.map(normToken).filter(Boolean);

  return ["growth"];
}

/* ======================================================
   Tier/Package compatibility layer
   - Your v1 JSON uses packages (starter/growth/dominance)
   - Some older logic expects "tiers" (starter_test/growth_bundle/dominance)
====================================================== */

function getTierById(tierId) {
  const cat = getCatalog();
  if (!cat) return null;

  const id = normToken(tierId);
  if (!id) return null;

  // 1) true tier list (if present)
  const hitTier = (cat.tiers || []).find((t) => normToken(t.id) === id);
  if (hitTier) return hitTier;

  // 2) package fallback (map growth_bundle -> growth etc.)
  const map = {
    starter_test: "starter",
    growth_bundle: "growth",
    dominance: "dominance",
    starter: "starter",
    growth: "growth",
  };
  const pid = map[id] || id;
  const p = (cat.packages || []).find((x) => normToken(x.id) === pid);
  if (!p) return null;

  // Return tier-like shape
  return {
    id: pid,
    label: cleanText(p.name || p.id),
    price_range: p.priceRange ? { text: p.priceRange } : null,
    includes: Array.isArray(p.includes) ? p.includes : [],
    frequency_hint: null,
  };
}

function listTierChoices() {
  const cat = getCatalog();
  if (!cat) return [];

  // Prefer tiers if defined
  if (Array.isArray(cat.tiers) && cat.tiers.length) {
    return cat.tiers.map((t) => ({
      id: cleanText(t.id),
      label: cleanText(t.label || t.id),
      range: t.price_range || null,
      frequency_hint: t.frequency_hint || null,
    }));
  }

  // Fall back to packages
  const pkgs = Array.isArray(cat.packages) ? cat.packages : [];
  const out = [];
  for (const p of pkgs) {
    out.push({
      id: cleanText(p.id),
      label: cleanText(p.name || p.id),
      range: p.priceRange ? { text: p.priceRange } : null,
      frequency_hint: null,
    });
  }
  return out;
}

/* ======================================================
   Token normalizers
====================================================== */

function normalizePropertyToken(s) {
  const t = cleanText(s).toLowerCase();
  if (!t) return null;

  if (/\b(tv|television)\b/.test(t)) return "tv";
  if (/\b(radio)\b/.test(t)) return "radio";
  if (/\b(website|site|web)\b/.test(t)) return "website";
  if (/\b(social|instagram|ig|facebook|threads|tiktok|linkedin)\b/.test(t)) return "social";
  if (/\b(bundle|all|combo|package)\b/.test(t)) return "bundle";

  return null;
}

function normalizeCtaToken(s) {
  const t = cleanText(s).toLowerCase();
  if (!t) return null;

  if (t.includes("book") && t.includes("call")) return "book_a_call";
  if (t.includes("rate") && (t.includes("card") || t.includes("rates") || t.includes("pricing")))
    return "request_rate_card";
  if (t.includes("whatsapp") || /\bwa\b/.test(t)) return "whatsapp";

  return null;
}

function parseBudgetNumbers(s) {
  const t = cleanText(s).replace(/[,]/g, "").toLowerCase();
  if (!t) return null;

  // support "500-1200", "500 to 1200", "under 500", "up to 800"
  const nums = t.match(/(\d{2,7})/g);
  if (!nums || !nums.length) return null;

  const a = Number(nums[0]);
  const b = nums.length > 1 ? Number(nums[1]) : null;
  if (!Number.isFinite(a)) return null;
  const min = Math.min(a, b || a);
  const max = Math.max(a, b || a);
  return { min, max };
}

function normalizeBudgetToken(s) {
  const t = cleanText(s).toLowerCase();
  if (!t) return null;

  if (/\b(starter|test|entry)\b/.test(t)) return "starter_test";
  if (/\b(growth|core|bundle)\b/.test(t)) return "growth_bundle";
  if (/\b(dominance|sponsored segment|takeover|premium)\b/.test(t)) return "dominance";

  const rng = parseBudgetNumbers(t);
  if (rng) {
    const mid = (rng.min + rng.max) / 2;
    if (mid < 500) return "starter_test";
    if (mid >= 500 && mid < 1500) return "growth_bundle";
    if (mid >= 1500) return "dominance";
  }

  return null;
}

function normalizeCategoryToken(s) {
  const t = cleanText(s).toLowerCase();
  if (!t) return null;

  // Quick map (expand later as you refine)
  if (/\b(church|ministry|gospel|faith)\b/.test(t)) return "church_faith_based";
  if (/\b(auto|car|mechanic|garage|tyres|tires|alignment|detailing)\b/.test(t)) return "auto_services";
  if (/\b(grocery|supermarket|market|food|pepper sauce|specialty)\b/.test(t)) return "grocery_specialty_food";
  if (/\b(barber|salon|hair|nails)\b/.test(t)) return "barber_salon";
  if (/\b(fitness|gym|trainer|wellness)\b/.test(t)) return "fitness_wellness";
  if (/\b(restaurant|takeout|food truck|catering)\b/.test(t)) return "restaurants_takeout";
  if (/\b(real estate|realtor|homes)\b/.test(t)) return "real_estate";
  if (/\b(mortgage|broker)\b/.test(t)) return "mortgage_broker";
  if (/\b(event|promoter|party|show|concert)\b/.test(t)) return "local_events_promoters";
  if (/\b(plumbing|electric|hvac|contractor|trades)\b/.test(t)) return "trades_plumbing_electrical_hvac";
  if (/\b(tutor|school|course|training|education)\b/.test(t)) return "education_tutoring_training";
  if (/\b(clinic|doctor|health|medical)\b/.test(t)) return "local_clinics_compliant";

  return "other";
}

/* ======================================================
   Bundle helpers
====================================================== */

function allowedBundleFromCatalog(props, wanted) {
  const out = [];
  const allow = props || { tv: true, radio: true, website: true, social: true };

  const pushIf = (k) => {
    if (!k) return;
    if (k === "tv" && !allow.tv) return;
    if (k === "radio" && !allow.radio) return;
    if (k === "website" && !allow.website) return;
    if (k === "social" && !allow.social) return;
    if (!out.includes(k)) out.push(k);
  };

  if (Array.isArray(wanted)) wanted.forEach(pushIf);
  else pushIf(wanted);

  return out;
}

/* ======================================================
   Recommendation scaffold
====================================================== */

/**
 * Recommendation scaffold.
 * Inputs: { property, tierId, budget, category, goal, cta }
 * Output: { ok, tierId, tierLabel, currency, propertyBundle, frequencyHint, notes, cta, recommendedPackageIds }
 */
function recommendPackage(input = {}) {
  const cat = getCatalog();
  if (!cat) {
    return {
      ok: false,
      error: "CATALOG_UNAVAILABLE",
      tierId: null,
      propertyBundle: [],
      frequencyHint: null,
      notes: "Sponsors catalog is not loaded.",
      recommendedPackageIds: [],
    };
  }

  const props = cat.properties || { tv: true, radio: true, website: true, social: true };
  const property = normalizePropertyToken(input.property) || "bundle";

  // Tier selection priority:
  // 1) explicit tierId if it matches catalog (tiers OR packages)
  // 2) budget token (starter/growth/dominance)
  // 3) catalog defaults
  // 4) fallback growth_bundle (or first available)
  const explicitTierId = normToken(input.tierId);
  const tierFromBudget = normalizeBudgetToken(input.budget);
  let tierId = null;

  if (explicitTierId && getTierById(explicitTierId)) tierId = explicitTierId;
  else if (tierFromBudget && getTierById(tierFromBudget)) tierId = tierFromBudget;
  else if (cat.defaults && normToken(cat.defaults.tier) && getTierById(cat.defaults.tier)) tierId = normToken(cat.defaults.tier);
  else
    tierId =
      getTierById("growth_bundle")
        ? "growth_bundle"
        : (cat.tiers && cat.tiers[0] && cat.tiers[0].id) ||
          (cat.packages && cat.packages[0] && cat.packages[0].id) ||
          "growth_bundle";

  const category = normalizeCategoryToken(input.category) || "other";
  const goal = cleanText(input.goal) || "brand awareness";

  const cta =
    normalizeCtaToken(input.cta) ||
    (cat.defaults && cleanText(cat.defaults.cta)) ||
    (cat.ctas && cat.ctas.primary) ||
    "book_a_call";

  // Bundle logic (respects enabled properties)
  let bundle = [];
  if (property === "bundle") {
    bundle = allowedBundleFromCatalog(props, ["tv", "radio", "website", "social"]);
    if (!props.tv && bundle.length > 3) bundle = bundle.filter((x) => x !== "tv");
  } else {
    bundle = allowedBundleFromCatalog(props, [property]);
    if (!bundle.length) bundle = allowedBundleFromCatalog(props, ["radio", "website", "social", "tv"]);
  }

  const tier = getTierById(tierId);
  const tierLabel = tier ? cleanText(tier.label || tier.id) : cleanText(tierId);

  // Frequency hint by tier, prefer catalog-defined hint
  let freq = tier && tier.frequency_hint ? tier.frequency_hint : null;
  if (!freq) {
    const idn = normToken(tierId);
    if (idn === "starter_test" || idn === "starter") freq = "Low frequency: 2–3 mentions/week (test + learn)";
    else if (idn === "growth_bundle" || idn === "growth") freq = "Core frequency: 4–7 mentions/week (enough repetition to move outcomes)";
    else if (idn === "dominance") freq = "High frequency: daily mentions or sponsored segment ownership";
    else freq = "Steady frequency matched to your flight dates and goals.";
  }

  const recommendedPackageIds = recommendPackageIds(cat, category, tierId);

  const notes = [`Category: ${category}`, `Goal: ${goal}`, `CTA: ${cta}`, `Tier: ${tierLabel}`].join(" | ");

  return {
    ok: true,
    tierId,
    tierLabel,
    currency: cat.currency || "CAD",
    propertyBundle: bundle,
    frequencyHint: freq,
    notes,
    cta,
    recommendedPackageIds,
  };
}

/* ======================================================
   Restrictions / CTA / Prompts
====================================================== */

function getRestrictions() {
  const cat = getCatalog();
  if (!cat) return null;
  return cat.restrictions || null;
}

function isRestrictedCategory(categoryIdOrText) {
  const cat = getCatalog();
  if (!cat) return false;

  const r = cat.restrictions || {};
  const list = Array.isArray(r.restricted_categories) ? r.restricted_categories : [];
  if (!list.length) return false;

  const id = cleanText(categoryIdOrText).toLowerCase();
  if (!id) return false;

  return list.some((x) => cleanText(x).toLowerCase() === id);
}

function getCtas() {
  const cat = getCatalog();
  if (!cat) return null;
  return cat.ctas || null;
}

function getLanePrompts() {
  const cat = getCatalog();
  if (!cat) return null;
  return cat.nyx_lane_prompts || null;
}

function getCatalogDebug() {
  return Object.assign({}, _cache);
}

module.exports = {
  DEFAULT_CATALOG_REL,
  ENV_CATALOG_PATH,

  // Load/cache
  loadCatalog,
  getCatalog,
  getCatalogMeta,
  getCatalogDebug,
  getCatalogStatus,

  // Token helper
  normToken,

  // Properties
  getProperties,
  allowedBundleFromCatalog,

  // Tiers/packages
  getTierById,
  listTierChoices,
  getPackageById,

  // Categories
  listCategoryIds,
  getCategory,
  getCategoryById,

  // Normalizers
  normalizePropertyToken,
  normalizeCtaToken,
  normalizeBudgetToken,
  normalizeCategoryToken,
  parseBudgetNumbers,

  // Recommendations
  recommendPackage,
  recommendPackageIds,

  // Governance
  getRestrictions,
  isRestrictedCategory,
  getCtas,
  getLanePrompts,
};

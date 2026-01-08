"use strict";

/**
 * Utils/sponsorsKnowledge.js
 *
 * Purpose:
 *  - Load Data/sponsors/sponsors_catalog_v1.json
 *  - Provide normalized helpers for categories, tiers, CTAs, restrictions
 *  - Provide a simple recommender scaffold (tier + bundle suggestion)
 *
 * Design notes:
 *  - No external deps
 *  - Safe file loading with cwd-relative fallback
 *  - Pure functions where possible
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_CATALOG_REL = "Data/sponsors/sponsors_catalog_v1.json";

let _cache = {
  loaded: false,
  rel: DEFAULT_CATALOG_REL,
  abs: null,
  catalog: null,
  error: null,
  mtimeMs: 0,
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
  return { json: j, mtimeMs: st.mtimeMs || 0 };
}

function findCatalogPath(relPath) {
  const rel = String(relPath || DEFAULT_CATALOG_REL).replace(/^\/+/, "");
  const candidates = [];

  // 1) cwd-relative
  candidates.push(path.join(process.cwd(), rel));

  // 2) relative to this file (../Data/...)
  candidates.push(path.join(__dirname, "..", rel));

  // 3) relative to project root guess
  candidates.push(path.join(process.cwd(), "src", rel));

  for (const abs of candidates) {
    try {
      if (fs.existsSync(abs)) return abs;
    } catch (_) {
      // ignore
    }
  }
  return null;
}

function normalizeCatalog(cat) {
  const catalog = cat && typeof cat === "object" ? cat : {};

  const currency = cleanText(catalog.currency || "CAD") || "CAD";
  const updated = cleanText(catalog.updated || nowIso());

  const properties = Object.assign(
    { tv: true, radio: true, website: true, social: true },
    catalog.properties && typeof catalog.properties === "object" ? catalog.properties : {}
  );

  const tiers = Array.isArray(catalog.tiers) ? catalog.tiers : [];
  const ctAs = catalog.ctas && typeof catalog.ctas === "object" ? catalog.ctas : {};
  const restrictions = catalog.restrictions && typeof catalog.restrictions === "object" ? catalog.restrictions : {};
  const categories = catalog.categories && typeof catalog.categories === "object" ? catalog.categories : {};

  return {
    version: cleanText(catalog.version || "sponsors_catalog_v1"),
    updated,
    currency,
    properties,
    tiers,
    categories,
    restrictions,
    ctas: ctAs,
    nyx_lane_prompts: catalog.nyx_lane_prompts && typeof catalog.nyx_lane_prompts === "object" ? catalog.nyx_lane_prompts : {},
  };
}

/**
 * Load catalog (cached). If file changes on disk, reload.
 */
function loadCatalog(relPath) {
  const rel = String(relPath || DEFAULT_CATALOG_REL).replace(/^\/+/, "") || DEFAULT_CATALOG_REL;

  // If we already loaded this path, check if file changed.
  const abs = findCatalogPath(rel);
  if (!abs) {
    _cache = {
      loaded: false,
      rel,
      abs: null,
      catalog: null,
      error: `CATALOG_NOT_FOUND: ${rel}`,
      mtimeMs: 0,
    };
    return { ok: false, error: _cache.error, rel, abs: null, catalog: null };
  }

  try {
    const st = fs.statSync(abs);
    const mtimeMs = st.mtimeMs || 0;

    if (_cache.loaded && _cache.abs === abs && _cache.mtimeMs === mtimeMs && _cache.catalog) {
      return { ok: true, rel, abs, catalog: _cache.catalog };
    }

    const { json, mtimeMs: newMtime } = tryReadJsonFile(abs);
    const catalog = normalizeCatalog(json);

    _cache = {
      loaded: true,
      rel,
      abs,
      catalog,
      error: null,
      mtimeMs: newMtime,
    };

    return { ok: true, rel, abs, catalog };
  } catch (e) {
    _cache = {
      loaded: false,
      rel,
      abs,
      catalog: null,
      error: `CATALOG_READ_ERROR: ${String(e && e.message ? e.message : e)}`,
      mtimeMs: 0,
    };
    return { ok: false, error: _cache.error, rel, abs, catalog: null };
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

function getTierById(tierId) {
  const cat = getCatalog();
  if (!cat) return null;
  const id = cleanText(tierId).toLowerCase();
  return (cat.tiers || []).find((t) => cleanText(t.id).toLowerCase() === id) || null;
}

function listTierChoices() {
  const cat = getCatalog();
  if (!cat) return [];
  return (cat.tiers || []).map((t) => ({
    id: cleanText(t.id),
    label: cleanText(t.label || t.id),
    range: t.price_range || null,
  }));
}

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
  if (t.includes("rate") && (t.includes("card") || t.includes("rates"))) return "request_rate_card";
  if (t.includes("whatsapp") || t.includes("wa")) return "whatsapp";

  return null;
}

function normalizeBudgetToken(s) {
  const t = cleanText(s).toLowerCase();
  if (!t) return null;

  if (/\b(starter|test|entry)\b/.test(t)) return "starter_test";
  if (/\b(growth|core|bundle)\b/.test(t)) return "growth_bundle";
  if (/\b(dominance|sponsored segment|takeover|premium)\b/.test(t)) return "dominance";

  // parse numeric range like "500" or "500-1200"
  const nums = t.match(/(\d{2,6})/g);
  if (nums && nums.length) {
    const n = Number(nums[0]);
    if (Number.isFinite(n)) {
      if (n < 500) return "starter_test";
      if (n >= 500 && n < 1500) return "growth_bundle";
      if (n >= 1500) return "dominance";
    }
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

  // fallback: return "other" (not in catalog categories, but lane can accept)
  return "other";
}

/**
 * Recommendation scaffold.
 * Inputs: { property, tierId, category, goal, cta }
 * Output: { tierId, propertyBundle, frequencyHint, notes }
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
    };
  }

  const property = normalizePropertyToken(input.property) || "bundle";
  const tierId = cleanText(input.tierId) || normalizeBudgetToken(input.budget) || "growth_bundle";
  const category = normalizeCategoryToken(input.category) || "other";
  const goal = cleanText(input.goal) || "brand awareness";
  const cta = normalizeCtaToken(input.cta) || (cat.ctas && cat.ctas.primary) || "book_a_call";

  // Bundle logic
  let bundle = [];
  if (property === "bundle") {
    bundle = ["radio", "website", "social"];
    if (cat.properties && cat.properties.tv) bundle.unshift("tv");
  } else {
    bundle = [property];
  }

  // Very light frequency hints by tier
  let freq = null;
  if (tierId === "starter_test") freq = "Low frequency: 2–3 mentions/week (test + learn)";
  if (tierId === "growth_bundle") freq = "Core frequency: 4–7 mentions/week (enough repetition to move outcomes)";
  if (tierId === "dominance") freq = "High frequency: daily mentions or sponsored segment ownership";

  const tier = getTierById(tierId);
  const tierLabel = tier ? cleanText(tier.label || tier.id) : tierId;

  const notes = [
    `Category: ${category}`,
    `Goal: ${goal}`,
    `CTA: ${cta}`,
    `Tier: ${tierLabel}`,
  ].join(" | ");

  return {
    ok: true,
    tierId,
    tierLabel,
    propertyBundle: bundle,
    frequencyHint: freq,
    notes,
  };
}

function getRestrictions() {
  const cat = getCatalog();
  if (!cat) return null;
  return cat.restrictions || null;
}

function getCtas() {
  const cat = getCatalog();
  if (!cat) return null;
  return cat.ctas || null;
}

function getCatalogDebug() {
  return Object.assign({}, _cache);
}

module.exports = {
  DEFAULT_CATALOG_REL,

  loadCatalog,
  getCatalog,
  getTierById,
  listTierChoices,

  normalizePropertyToken,
  normalizeCtaToken,
  normalizeBudgetToken,
  normalizeCategoryToken,

  recommendPackage,
  getRestrictions,
  getCtas,

  getCatalogDebug,
};

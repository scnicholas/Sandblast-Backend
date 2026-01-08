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

function findCatalogPath(relPath) {
  // 0) Env override supports absolute or relative
  const env = cleanText(process.env[ENV_CATALOG_PATH] || "");
  const chosen = cleanText(relPath || "") || env || DEFAULT_CATALOG_REL;

  // If absolute path is provided, try it directly
  try {
    if (chosen && path.isAbsolute(chosen) && fs.existsSync(chosen)) return chosen;
  } catch (_) {
    // ignore
  }

  const rel = String(chosen || DEFAULT_CATALOG_REL).replace(/^\/+/, "");
  const candidates = [];

  // 1) cwd-relative
  candidates.push(path.join(process.cwd(), rel));

  // 2) relative to this file (../Data/...)
  candidates.push(path.join(__dirname, "..", rel));

  // 3) relative to project root guess (/src)
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

function normalizeTier(t) {
  const obj = t && typeof t === "object" ? t : {};
  const id = cleanText(obj.id).toLowerCase();
  if (!id) return null;

  const label = cleanText(obj.label || obj.name || obj.id);
  const price_range = obj.price_range && typeof obj.price_range === "object" ? obj.price_range : null;

  // Optional per-tier defaults (not required)
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

  // Tiers normalized + dedup by id
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

  // CTAs normalized
  const ctAs = catalog.ctas && typeof catalog.ctas === "object" ? catalog.ctas : {};
  const ctas = {
    primary: cleanText(ctAs.primary || "book_a_call") || "book_a_call",
    options: Array.isArray(ctAs.options) ? ctAs.options.map(cleanText).filter(Boolean) : [],
    // Optional per-CTA payloads/labels can live in JSON; we preserve unknown keys
    ...ctAs,
  };

  // Restrictions normalized
  const restrictionsIn = catalog.restrictions && typeof catalog.restrictions === "object" ? catalog.restrictions : {};
  const restrictions = {
    // Common keys (all optional)
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

  // Optional defaults (helps sponsorsLane avoid asking the same thing repeatedly)
  const defaultsIn = catalog.defaults && typeof catalog.defaults === "object" ? catalog.defaults : {};
  const defaults = {
    currency: cleanText(defaultsIn.currency || currency) || currency,
    cta: cleanText(defaultsIn.cta || ctas.primary) || ctas.primary,
    tier: cleanText(defaultsIn.tier || "growth_bundle") || "growth_bundle",
    ...defaultsIn,
  };

  return {
    version: cleanText(catalog.version || "sponsors_catalog_v1"),
    updated,
    currency,
    properties,
    tiers: tiersNorm,
    categories,
    restrictions,
    ctas,
    defaults,
    nyx_lane_prompts,
  };
}

/**
 * Load catalog (cached). If file changes on disk, reload.
 */
function loadCatalog(relPath) {
  const rel =
    pickFirstNonEmpty([relPath, process.env[ENV_CATALOG_PATH], DEFAULT_CATALOG_REL], DEFAULT_CATALOG_REL).replace(
      /^\/+/,
      ""
    );

  const abs = findCatalogPath(rel);
  if (!abs) {
    _cache = {
      loaded: false,
      rel,
      abs: null,
      catalog: null,
      error: `CATALOG_NOT_FOUND: ${rel}`,
      mtimeMs: 0,
      loadedAt: 0,
    };
    return { ok: false, error: _cache.error, rel, abs: null, catalog: null };
  }

  try {
    const st = fs.statSync(abs);
    const mtimeMs = Number(st.mtimeMs || 0);

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
      loadedAt: Date.now(),
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
      loadedAt: 0,
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

function getCatalogMeta() {
  const c = getCatalog();
  if (!c) return null;
  return {
    version: c.version,
    updated: c.updated,
    currency: c.currency,
    properties: c.properties,
    tiers: (c.tiers || []).map((t) => ({ id: t.id, label: t.label, price_range: t.price_range || null })),
  };
}

function getProperties() {
  const cat = getCatalog();
  if (!cat) return { tv: true, radio: true, website: true, social: true };
  return cat.properties || { tv: true, radio: true, website: true, social: true };
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
    frequency_hint: t.frequency_hint || null,
  }));
}

function listCategoryIds() {
  const cat = getCatalog();
  if (!cat) return [];
  return Object.keys(cat.categories || {}).map((k) => cleanText(k)).filter(Boolean);
}

function getCategoryById(categoryId) {
  const cat = getCatalog();
  if (!cat) return null;
  const id = cleanText(categoryId).toLowerCase();
  const obj = cat.categories || {};
  const hitKey = Object.keys(obj).find((k) => cleanText(k).toLowerCase() === id);
  if (!hitKey) return null;
  const v = obj[hitKey];
  if (v && typeof v === "object") return { id: hitKey, ...v };
  return { id: hitKey, label: cleanText(String(v || hitKey)) };
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
    // classify by midpoint (simple)
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

  // fallback: return "other" (lane can accept)
  return "other";
}

function allowedBundleFromCatalog(props, wanted) {
  // wanted: array of keys or single
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

/**
 * Recommendation scaffold.
 * Inputs: { property, tierId, budget, category, goal, cta }
 * Output: { ok, tierId, tierLabel, currency, propertyBundle, frequencyHint, notes, cta }
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

  const props = cat.properties || { tv: true, radio: true, website: true, social: true };

  const property = normalizePropertyToken(input.property) || "bundle";

  // Tier selection priority:
  // 1) explicit tierId if it matches catalog
  // 2) budget token (starter/growth/dominance)
  // 3) catalog defaults
  // 4) fallback growth_bundle
  const explicitTierId = cleanText(input.tierId).toLowerCase();
  const tierFromBudget = normalizeBudgetToken(input.budget);
  let tierId = null;

  if (explicitTierId && getTierById(explicitTierId)) tierId = explicitTierId;
  else if (tierFromBudget && getTierById(tierFromBudget)) tierId = tierFromBudget;
  else if (cat.defaults && cleanText(cat.defaults.tier) && getTierById(cat.defaults.tier)) tierId = cleanText(cat.defaults.tier).toLowerCase();
  else tierId = getTierById("growth_bundle") ? "growth_bundle" : ((cat.tiers && cat.tiers[0] && cat.tiers[0].id) || "growth_bundle");

  const category = normalizeCategoryToken(input.category) || "other";
  const goal = cleanText(input.goal) || "brand awareness";

  const cta = normalizeCtaToken(input.cta) || (cat.defaults && cleanText(cat.defaults.cta)) || (cat.ctas && cat.ctas.primary) || "book_a_call";

  // Bundle logic (respects enabled properties)
  let bundle = [];
  if (property === "bundle") {
    // Preferred order: tv (if enabled), then radio, website, social
    bundle = allowedBundleFromCatalog(props, ["tv", "radio", "website", "social"]);
    // If only one property is enabled, keep it, else keep the core 3 if tv disabled
    if (!props.tv && bundle.length > 3) bundle = bundle.filter((x) => x !== "tv");
  } else {
    bundle = allowedBundleFromCatalog(props, [property]);
    // If requested property is disabled, fall back to whatever is available
    if (!bundle.length) bundle = allowedBundleFromCatalog(props, ["radio", "website", "social", "tv"]);
  }

  const tier = getTierById(tierId);
  const tierLabel = tier ? cleanText(tier.label || tier.id) : tierId;

  // Frequency hint by tier, prefer catalog-defined hint
  let freq = tier && tier.frequency_hint ? tier.frequency_hint : null;
  if (!freq) {
    if (tierId === "starter_test") freq = "Low frequency: 2–3 mentions/week (test + learn)";
    else if (tierId === "growth_bundle") freq = "Core frequency: 4–7 mentions/week (enough repetition to move outcomes)";
    else if (tierId === "dominance") freq = "High frequency: daily mentions or sponsored segment ownership";
    else freq = "Steady frequency matched to your flight dates and goals.";
  }

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
    currency: cat.currency || "CAD",
    propertyBundle: bundle,
    frequencyHint: freq,
    notes,
    cta,
  };
}

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

  loadCatalog,
  getCatalog,
  getCatalogMeta,

  getProperties,

  getTierById,
  listTierChoices,

  listCategoryIds,
  getCategoryById,

  normalizePropertyToken,
  normalizeCtaToken,
  normalizeBudgetToken,
  normalizeCategoryToken,

  parseBudgetNumbers,

  recommendPackage,
  getRestrictions,
  isRestrictedCategory,
  getCtas,
  getLanePrompts,

  getCatalogDebug,
};

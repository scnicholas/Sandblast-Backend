"use strict";

/**
 * Utils/sponsorsLane.js
 *
 * Sponsors Lane v1.2 (TIGHT + Deterministic + Chip-Safe + Optional Business/Restrictions + Script Variants)
 *
 * Option A Update (surgical fixes + forward-motion guarantees):
 *  1) Rotation bug fix: pickRotate now starts at -1 so it actually returns option[0] first.
 *  2) “Ask-once” guards for optional fields:
 *      - business is OPTIONAL and should be asked at most once unless user explicitly requests.
 *      - restrictions is OPTIONAL and should be asked at most once unless user explicitly requests.
 *     Implemented via state flags: askedBusiness, askedRestrictions.
 *  3) Budget number parsing fallback:
 *      - If user types a number (e.g., “800”) and SK doesn’t normalize it, map it to a tier deterministically.
 *  4) Chip-safe progression:
 *      - “Skip” and “No restrictions” now actually advance and don’t cause repeated asks.
 *
 * Purpose:
 *  - Sponsors Lane conversational handler (Nyx-ready)
 *  - Collects minimal fields:
 *      property (tv/radio/website/social/bundle)
 *      goal (calls/foot traffic/website clicks/brand awareness)
 *      category (catalog id or "other")
 *      business (optional, but used for scripts; NEVER fall back to category unless user explicitly requests)
 *      budgetTier (starter_test/growth_bundle/dominance)
 *      cta (book_a_call/request_rate_card/whatsapp)
 *      restrictions (optional free text)
 *  - Returns:
 *      reply (6–10 lines, no fluff)
 *      followUps (array of {label,send})
 *      sessionPatch (state updates)
 *
 * How to use in index.js:
 *  - When session.lane === "sponsors" OR text indicates sponsor intent,
 *    call sponsorsLane.handleChat({ text, session })
 *  - Then merge sessionPatch and respondJson() with lane followUps
 */

const SK = require("./sponsorsKnowledge");

/* ======================================================
   Utilities
====================================================== */

function cleanText(s) {
  return String(s || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic rotation that actually returns options[0] first.
 */
function pickRotate(session, key, options) {
  if (!session || !Array.isArray(options) || options.length === 0) {
    return (options && options[0]) || "";
  }
  const k = String(key || "rot");
  const idxKey = `_rot_${k}`;
  const last = Number.isFinite(Number(session[idxKey])) ? Number(session[idxKey]) : -1;
  const next = (last + 1) % options.length;
  session[idxKey] = next;
  return options[next];
}

function normalizeYesNo(s) {
  const t = cleanText(s).toLowerCase();
  if (!t) return null;
  if (/^(y|yes|yep|yeah|sure|ok|okay)\b/.test(t)) return true;
  if (/^(n|no|nope|nah)\b/.test(t)) return false;
  return null;
}

function isSponsorIntent(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;

  // Very explicit sponsor lane triggers
  if (
    t.includes("sponsor") ||
    t.includes("sponsors lane") ||
    t.includes("sponsor lane") ||
    t.includes("advertis") ||
    t.includes("rate card") ||
    t.includes("media kit") ||
    t.includes("promo") ||
    t.includes("promotion") ||
    t.includes("ad spot") ||
    t.includes("commercial") ||
    t.includes("campaign") ||
    t.includes("banner ad") ||
    t.includes("run an ad") ||
    t.includes("buy ads") ||
    t.includes("ad space") ||
    t.includes("pricing")
  )
    return true;

  // Soft triggers (but still pretty safe)
  if (/\b(brand deal|sponsorship|sponsored|spot buy|flight|impressions|cpm)\b/.test(t))
    return true;

  return false;
}

function normalizeGoal(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  if (t.includes("call") || t.includes("booking") || /\bbook\b/.test(t)) return "calls";
  if (t.includes("foot") || t.includes("store") || t.includes("walk-in") || t.includes("walk in"))
    return "foot traffic";
  if (t.includes("click") || t.includes("website") || t.includes("site")) return "website clicks";
  if (t.includes("awareness") || t.includes("brand")) return "brand awareness";

  return null;
}

function isTierId(s) {
  const t = cleanText(s).toLowerCase();
  return t === "starter_test" || t === "growth_bundle" || t === "dominance";
}

function looksLikeUrl(s) {
  const t = cleanText(s).toLowerCase();
  if (!t) return false;
  return t.includes("http://") || t.includes("https://") || t.startsWith("www.");
}

function parseBudgetNumber(text) {
  const t = cleanText(text);
  if (!t) return null;

  // Pull the first number-looking token; allow commas and $.
  const m = t.match(/(?:^|\s)\$?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.\d+)?(?:\s|$)/);
  if (!m || !m[1]) return null;

  const raw = m[1].replace(/,/g, "");
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/* ======================================================
   State
====================================================== */

function getState(session) {
  const s = session && typeof session === "object" ? session : {};
  if (!s.sponsors) s.sponsors = {};
  const st = s.sponsors;

  return {
    property: cleanText(st.property || ""), // tv|radio|website|social|bundle
    goal: cleanText(st.goal || ""),
    category: cleanText(st.category || ""),
    business: cleanText(st.business || st.businessName || st.brand || ""),
    budgetTier: cleanText(st.budgetTier || ""),
    cta: cleanText(st.cta || ""),
    restrictions: cleanText(st.restrictions || ""),
    stage: cleanText(st.stage || ""), // ask_property|ask_goal|ask_category|ask_business|ask_budget|ask_cta|ask_restrictions|done

    // Ask-once flags for OPTIONAL fields (prevents loops)
    askedBusiness: !!st.askedBusiness,
    askedRestrictions: !!st.askedRestrictions,
  };
}

function setState(session, patch) {
  if (!session || typeof session !== "object") return;
  if (!session.sponsors) session.sponsors = {};
  Object.assign(session.sponsors, patch || {});
}

/* ======================================================
   Catalog helpers
====================================================== */

function getCtaLabels(catalog) {
  const labels =
    (catalog &&
      catalog.ctas &&
      catalog.ctas.labels &&
      typeof catalog.ctas.labels === "object" &&
      catalog.ctas.labels) ||
    {};
  return {
    book_a_call: cleanText(labels.book_a_call || "Book a call") || "Book a call",
    request_rate_card: cleanText(labels.request_rate_card || "Request rate card") || "Request rate card",
    whatsapp: cleanText(labels.whatsapp || "WhatsApp") || "WhatsApp",
  };
}

function prettifyCategory(catalog, categoryId) {
  const id = cleanText(categoryId).toLowerCase();
  if (!id) return "other";
  const c = catalog && catalog.categories ? catalog.categories : null;
  if (!c || typeof c !== "object") return id;

  const hitKey = Object.keys(c).find((k) => cleanText(k).toLowerCase() === id);
  if (!hitKey) return id;

  const v = c[hitKey];
  if (v && typeof v === "object") return cleanText(v.label || v.name || hitKey) || hitKey;
  return cleanText(String(v || hitKey)) || hitKey;
}

function formatBundle(bundle = []) {
  const b = Array.isArray(bundle) ? bundle : [];
  const pretty = b.map((x) => {
    if (x === "tv") return "TV";
    if (x === "radio") return "Radio";
    if (x === "website") return "Website";
    if (x === "social") return "Social";
    return String(x);
  });
  return pretty.join(" + ");
}

/* ======================================================
   Followups
====================================================== */

function makeFollowUpsForStage(stage, catalog) {
  const props = (catalog && catalog.properties) || {
    tv: true,
    radio: true,
    website: true,
    social: true,
  };
  const ctaLabels = getCtaLabels(catalog);

  const tierChoices = SK.listTierChoices(); // [{id,label,range}]
  const tiers = tierChoices.length
    ? tierChoices
    : [
        { id: "starter_test", label: "Starter ($250–$499)" },
        { id: "growth_bundle", label: "Growth ($500–$1,200)" },
        { id: "dominance", label: "Dominance ($1,500–$3,500+)" },
      ];

  if (stage === "ask_property") {
    const out = [];
    if (props.tv) out.push({ label: "TV", send: "TV" });
    if (props.radio) out.push({ label: "Radio", send: "Radio" });
    if (props.website) out.push({ label: "Website", send: "Website" });
    if (props.social) out.push({ label: "Social", send: "Social" });
    out.push({ label: "Bundle", send: "Bundle" });
    out.push({ label: "Request rate card", send: "Request rate card" });
    out.push({ label: "Build my offer", send: "Build my offer" });
    return out.slice(0, 8);
  }

  if (stage === "ask_goal") {
    return [
      { label: "Calls", send: "Calls" },
      { label: "Foot traffic", send: "Foot traffic" },
      { label: "Website clicks", send: "Website clicks" },
      { label: "Brand awareness", send: "Brand awareness" },
      { label: "Request rate card", send: "Request rate card" },
      { label: "Build my offer", send: "Build my offer" },
    ].slice(0, 8);
  }

  if (stage === "ask_category") {
    return [
      { label: "Restaurant/Takeout", send: "Restaurant/Takeout" },
      { label: "Auto Services", send: "Auto Services" },
      { label: "Grocery/Specialty", send: "Grocery/Specialty" },
      { label: "Church/Faith", send: "Church/Faith" },
      { label: "Fitness/Wellness", send: "Fitness/Wellness" },
      { label: "Trades", send: "Trades" },
      { label: "Events", send: "Events" },
      { label: "Other", send: "Other" },
    ].slice(0, 8);
  }

  if (stage === "ask_business") {
    return [
      { label: "Skip (generic)", send: "Skip" },
      { label: "Use category name", send: "Use category name" },
      { label: "Business: (type it)", send: "Business: " },
      { label: "Build my offer", send: "Build my offer" },
    ].slice(0, 8);
  }

  if (stage === "ask_budget") {
    return tiers.slice(0, 3).map((t) => ({
      label: cleanText(t.label || t.id),
      send: cleanText(t.id || t.label),
    }));
  }

  if (stage === "ask_cta") {
    return [
      { label: ctaLabels.book_a_call, send: "book_a_call" },
      { label: ctaLabels.request_rate_card, send: "request_rate_card" },
      { label: ctaLabels.whatsapp, send: "whatsapp" },
      { label: "Build my offer", send: "Build my offer" },
    ].slice(0, 8);
  }

  if (stage === "ask_restrictions") {
    return [
      { label: "No restrictions", send: "No restrictions" },
      { label: "Standard policy restrictions", send: "Standard policy restrictions" },
      { label: "I have restrictions", send: "I have restrictions" },
      { label: "Build my offer", send: "Build my offer" },
    ].slice(0, 8);
  }

  // done
  return [
    { label: "Build my offer", send: "Build my offer" },
    { label: "Write 15-second script", send: "Write 15-second script" },
    { label: "30-second cut", send: "30-second cut" },
    { label: "Request rate card", send: "Request rate card" },
    { label: "Another sponsor", send: "Another sponsor" },
  ].slice(0, 8);
}

/* ======================================================
   Prompts + stage selection
====================================================== */

function stagePrompt(stage, session, catalog) {
  const p = (catalog && catalog.nyx_lane_prompts) || {};
  const currency = (catalog && catalog.currency) || "CAD";

  if (stage === "ask_property") {
    return (
      p.open ||
      "Sponsors Lane — quick setup. What do you want to promote: TV, Radio, Website, Social, or a bundle?"
    );
  }
  if (stage === "ask_goal") {
    return p.goal || "What’s your goal: calls, foot traffic, website clicks, or brand awareness?";
  }
  if (stage === "ask_category") {
    return (
      p.category ||
      "What category are you in? (restaurant, auto, grocery, church, fitness, trades, events, other)"
    );
  }
  if (stage === "ask_business") {
    return (
      p.business ||
      "Sponsor name (what should I say on-air)? Reply “Business: <name>” or tap Skip."
    );
  }
  if (stage === "ask_budget") {
    return (
      p.budget || `Budget tier in ${currency}: Starter, Growth, or Dominance? (Or type a number like “800”.)`
    );
  }
  if (stage === "ask_cta") {
    return p.cta || "Preferred CTA: Book a call, Request rate card, or WhatsApp?";
  }
  if (stage === "ask_restrictions") {
    return p.restrictions || "Any restrictions I should know? (or should I apply standard policy restrictions)";
  }

  return pickRotate(session, "sponsors_done", [
    "Locked. Say “Build my offer” and I’ll recommend a bundle and draft your first 15-second script.",
    "Perfect. Say “Build my offer” and I’ll package this into a clean recommendation + first script.",
  ]);
}

/**
 * Optional fields are “ask-once”:
 *  - business: ask once (unless user explicitly engages it)
 *  - restrictions: ask once (unless user explicitly engages it)
 */
function nextMissingField(state) {
  if (!state.property) return "ask_property";
  if (!state.goal) return "ask_goal";
  if (!state.category) return "ask_category";

  if (!state.askedBusiness && !state.business) return "ask_business";

  if (!state.budgetTier) return "ask_budget";
  if (!state.cta) return "ask_cta";

  if (!state.askedRestrictions && !state.restrictions) return "ask_restrictions";

  return "done";
}

/* ======================================================
   Parsing + state application
====================================================== */

function extractBusinessName(text, state) {
  const t = cleanText(text);
  const lower = t.toLowerCase();
  if (!t) return "";

  // "Business: Acme Auto"
  const m1 = t.match(/\b(business|company|brand|sponsor)\s*:\s*(.+)$/i);
  if (m1 && m1[2]) {
    const v = cleanText(m1[2]);
    if (v) return v;
  }

  // "Sponsored by Acme Auto"
  const m2 = t.match(/\b(sponsored by|sponsor is|our sponsor is)\s+(.+)$/i);
  if (m2 && m2[2]) {
    const v = cleanText(m2[2]);
    if (v) return v;
  }

  // If they’re in ask_business stage and they typed something short, accept it
  if (
    state &&
    state.stage === "ask_business" &&
    t.length >= 2 &&
    t.length <= 60 &&
    !looksLikeUrl(t) &&
    !t.includes("@") &&
    !/\b(rate card|bundle|tier|growth|starter|dominance)\b/.test(lower)
  ) {
    // Avoid treating category labels as business name unless they explicitly used "Use category name"
    if (
      !/\b(auto services|restaurant\/takeout|grocery\/specialty|church\/faith|fitness\/wellness|trades|events|other)\b/i.test(
        t
      )
    ) {
      return t;
    }
  }

  return "";
}

function applyUserAnswerToState(text, state, catalog) {
  const t = cleanText(text);
  const lower = t.toLowerCase();

  // property
  const prop = SK.normalizePropertyToken(t);
  if (prop) state.property = prop;

  // goal
  const goal = normalizeGoal(t);
  if (goal) state.goal = goal;

  // category
  const cat = SK.normalizeCategoryToken(t);
  if (cat) state.category = cat;

  // business name capture (NEVER infer from category unless user explicitly requests)
  const explicitBusinessEngagement =
    lower === "skip" || lower === "use category name" || /\b(business|company|brand|sponsor)\s*:/.test(lower);

  if (!state.business) {
    const bn = extractBusinessName(t, state);
    if (bn) {
      state.business = bn;
      state.askedBusiness = true;
    }
  }

  if (lower === "skip") {
    state.business = ""; // keep empty (generic)
    state.askedBusiness = true; // IMPORTANT: prevents re-asking
  }

  if (lower === "use category name") {
    const catPretty = prettifyCategory(catalog, state.category || "other");
    if (catPretty && catPretty !== "other") state.business = catPretty;
    state.askedBusiness = true; // user explicitly requested this mapping
  }

  // If user explicitly engages business but provides nothing (e.g., “business:”),
  // mark asked so we don’t loop.
  if (explicitBusinessEngagement && state.stage === "ask_business") {
    state.askedBusiness = true;
  }

  // budget tier (supports explicit tier id OR catalog normalization)
  let tier = isTierId(lower) ? lower : SK.normalizeBudgetToken(t);
  if (!tier) {
    const n = parseBudgetNumber(t);
    if (n) {
      // Deterministic fallback mapping
      if (n < 500) tier = "starter_test";
      else if (n < 1500) tier = "growth_bundle";
      else tier = "dominance";
    }
  }
  if (tier) state.budgetTier = tier;

  // cta (supports explicit token or friendly phrases)
  const cta =
    lower === "book_a_call" || lower === "request_rate_card" || lower === "whatsapp"
      ? lower
      : SK.normalizeCtaToken(t);
  if (cta) state.cta = cta;

  // soft-cta shortcuts
  if (lower.includes("rate card")) state.cta = "request_rate_card";
  if (lower.includes("media kit")) state.cta = "request_rate_card";
  if (lower.includes("whatsapp")) state.cta = "whatsapp";
  if (lower.includes("book") && lower.includes("call")) state.cta = "book_a_call";

  // restrictions (optional, ask-once logic)
  if (lower.includes("no restrictions")) {
    state.restrictions = "none";
    state.askedRestrictions = true;
  } else if (lower.includes("standard policy")) {
    state.restrictions = "standard";
    state.askedRestrictions = true;
  } else if (lower.includes("i have restrictions")) {
    // user is signaling they’ll type them next; mark asked so we don't loop
    state.restrictions = "custom";
    state.askedRestrictions = true;
  } else {
    // If they typed a real restriction line, accept it
    if (state.stage === "ask_restrictions" && t.length >= 6) {
      state.restrictions = t;
      state.askedRestrictions = true;
    }
    // If they used the word restrict anywhere, accept
    if (!state.restrictions && t.length >= 8 && lower.includes("restrict")) {
      state.restrictions = t;
      state.askedRestrictions = true;
    }
  }

  // Actions (tight: avoid matching every “build” in a sentence)
  const wantsBuild =
    lower === "build my offer" ||
    /\b(build my offer|build the offer|recommend package|recommend a package|package it|get a package recommendation)\b/.test(
      lower
    );

  const wantsAnother = lower === "another sponsor" || lower.includes("new sponsor");
  const wantsRateCard =
    lower === "request rate card" || lower.includes("rate card") || lower.includes("media kit");

  // Script variants / actions
  const wants15 =
    lower === "write 15-second script" ||
    /\b(15[- ]second|15s)\b/.test(lower) ||
    (lower.includes("write") && lower.includes("script") && !/\b30\b/.test(lower));

  const wants30 =
    /\b(30[- ]second|30s)\b/.test(lower) || lower.includes("30-second") || lower.includes("30 second");

  const wantsRadioVersion = /\bradio version\b/.test(lower);
  const wantsWebsiteVersion = /\bwebsite version\b/.test(lower);
  const wantsTvTag = /\btv tag\b/.test(lower);

  // Lane enter
  const enterLane = lower === "sponsors lane" || lower === "sponsor lane";

  return {
    wantsBuild,
    wantsAnother,
    wantsRateCard,
    wants15,
    wants30,
    wantsRadioVersion,
    wantsWebsiteVersion,
    wantsTvTag,
    enterLane,
  };
}

/* ======================================================
   Offer + scripts
====================================================== */

function buildOfferReply(session, state, catalog) {
  const rec = SK.recommendPackage({
    property: state.property,
    tierId: state.budgetTier,
    category: state.category,
    goal: state.goal,
    cta: state.cta,
  });

  if (!rec || !rec.ok) {
    return pickRotate(session, "sponsors_offer_fail", [
      "Sponsors Lane — I can’t load the sponsors catalog right now.",
      "Tell me: TV/Radio/Website/Social + budget tier + category, and I’ll package a recommendation anyway.",
    ]);
  }

  const currency = (catalog && catalog.currency) || "CAD";
  const tierLine = `${rec.tierLabel} (${currency})`;
  const bundleLine = formatBundle(rec.propertyBundle);
  const goalLine = state.goal || "brand awareness";

  const ctaLabels = getCtaLabels(catalog);
  const ctaPretty =
    (state.cta === "book_a_call" && ctaLabels.book_a_call) ||
    (state.cta === "request_rate_card" && ctaLabels.request_rate_card) ||
    (state.cta === "whatsapp" && ctaLabels.whatsapp) ||
    ctaLabels.book_a_call;

  const categoryPretty = prettifyCategory(catalog, state.category || "other");

  const restrictLine =
    !state.restrictions || state.restrictions === "none"
      ? "Restrictions: standard policy only"
      : state.restrictions === "standard"
      ? "Restrictions: standard policy"
      : state.restrictions === "custom"
      ? "Restrictions: noted (custom)"
      : `Restrictions: ${state.restrictions}`;

  const sponsorNameLine = state.business ? `Sponsor: ${state.business}` : "Sponsor: (name optional)";

  // 6–10 lines, no fluff
  const lines = [
    "Sponsors Lane — recommendation:",
    `1) Bundle: ${bundleLine}`,
    `2) Tier: ${tierLine}`,
    `3) Category: ${categoryPretty}`,
    `4) Goal: ${goalLine}`,
    `5) CTA: ${ctaPretty}`,
    `6) Frequency: ${rec.frequencyHint || "4–7 mentions/week"}`,
    `7) ${restrictLine}`,
    `8) ${sponsorNameLine}`,
    "Next: “Write 15-second script” or “Request rate card”.",
  ];

  return lines.join("\n");
}

function buildRateCardReply(session, catalog) {
  const currency = (catalog && catalog.currency) || "CAD";
  const tiers = SK.listTierChoices();
  const ctaLabels = getCtaLabels(catalog);

  const lines = [
    `Rate card snapshot (${currency}):`,
    tiers.length ? `1) ${tiers[0].label}` : "1) Starter — entry test flight",
    tiers.length > 1 ? `2) ${tiers[1].label}` : "2) Growth — repeat exposure + outcomes",
    tiers.length > 2 ? `3) ${tiers[2].label}` : "3) Dominance — segment ownership + scale",
    `Next: choose a tier, then your CTA (${ctaLabels.book_a_call} / ${ctaLabels.request_rate_card} / ${ctaLabels.whatsapp}).`,
  ];

  return lines.join("\n");
}

function getSponsorNameForScript(state, catalog) {
  const name = cleanText(state.business || "");
  if (name) return name;

  // Never use raw category id like "other" as sponsor name.
  return "your business";
}

function getCtaPretty(state, catalog) {
  const ctaLabels = getCtaLabels(catalog);
  const cta =
    state.cta || (catalog && catalog.defaults && cleanText(catalog.defaults.cta)) || "book_a_call";

  return (
    (cta === "book_a_call" && ctaLabels.book_a_call) ||
    (cta === "request_rate_card" && ctaLabels.request_rate_card) ||
    (cta === "whatsapp" && ctaLabels.whatsapp) ||
    ctaLabels.book_a_call
  );
}

function buildScript15(state, catalog) {
  const sponsorName = getSponsorNameForScript(state, catalog);
  const ctaPretty = getCtaPretty(state, catalog);
  const goalPretty = state.goal || "results";

  return [
    "15-second sponsor script:",
    `“This hour on Sandblast is sponsored by ${sponsorName}. If you want ${goalPretty} without the noise, get in front of the right audience. ${ctaPretty} today and lock your spot.”`,
    "Next: say “Build my offer” to package TV/Radio/Website/Social, or ask for a 30-second cut.",
  ].join("\n");
}

function buildScript30(state, catalog) {
  const sponsorName = getSponsorNameForScript(state, catalog);
  const ctaPretty = getCtaPretty(state, catalog);
  const goalPretty = state.goal || "results";

  return [
    "30-second sponsor script:",
    `“Sandblast is powered by sponsors like ${sponsorName}. If you’re serious about ${goalPretty}, this is where you show up consistently—on-air, on-site, and in social feeds. We build a clean flight, track outcomes, and keep the message tight. ${ctaPretty} and we’ll map the best package for your budget.”`,
    "Want it tailored for Radio vs Website, or a TV tag?",
  ].join("\n");
}

function buildVariantTag(variant, state, catalog) {
  const sponsorName = getSponsorNameForScript(state, catalog);
  const ctaPretty = getCtaPretty(state, catalog);

  if (variant === "radio") {
    return ["Radio version (tag):", `“Sponsored by ${sponsorName}. ${ctaPretty} today.”`].join("\n");
  }

  if (variant === "website") {
    return [
      "Website version (tag):",
      `“This segment is brought to you by ${sponsorName}. Visit us online—${ctaPretty}.”`,
    ].join("\n");
  }

  if (variant === "tv") {
    return ["TV tag (super short):", `“Sandblast is sponsored by ${sponsorName}. ${ctaPretty}.”`].join("\n");
  }

  return "";
}

/* ======================================================
   Main handler
====================================================== */

function handleChat({ text, session } = {}) {
  const message = cleanText(text);

  // Load catalog (safe)
  const loaded = SK.loadCatalog(SK.DEFAULT_CATALOG_REL);
  const catalog = loaded && loaded.ok ? loaded.catalog : null;

  // Force lane
  if (session && typeof session === "object") session.lane = "sponsors";

  const state = getState(session);
  const lower = message.toLowerCase();

  // Hard reset / new sponsor
  if (lower === "another sponsor" || lower.includes("new sponsor")) {
    setState(session, {
      property: "",
      goal: "",
      category: "",
      business: "",
      budgetTier: "",
      cta: "",
      restrictions: "",
      stage: "ask_property",
      askedBusiness: false,
      askedRestrictions: false,
    });

    const reply = stagePrompt("ask_property", session, catalog);
    return {
      reply,
      followUps: makeFollowUpsForStage("ask_property", catalog),
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Apply answer + detect actions
  const action = applyUserAnswerToState(message, state, catalog);

  // If user just enters Sponsors Lane, start at property
  if (action.enterLane && nextMissingField(state) === "ask_property") {
    state.stage = "ask_property";
    setState(session, state);
    const reply = stagePrompt("ask_property", session, catalog);
    return {
      reply,
      followUps: makeFollowUpsForStage("ask_property", catalog),
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Rate card request (fast path)
  if (action.wantsRateCard) {
    state.cta = "request_rate_card";
    setState(session, state);

    return {
      reply: buildRateCardReply(session, catalog),
      followUps: [
        { label: "Starter", send: "starter_test" },
        { label: "Growth", send: "growth_bundle" },
        { label: "Dominance", send: "dominance" },
        { label: "Build my offer", send: "Build my offer" },
      ],
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Script variants
  if (action.wantsRadioVersion) {
    const reply = buildVariantTag("radio", state, catalog);
    return {
      reply,
      followUps: [
        { label: "Write 15-second script", send: "Write 15-second script" },
        { label: "30-second cut", send: "30-second cut" },
        { label: "TV tag", send: "TV tag" },
        { label: "Build my offer", send: "Build my offer" },
      ],
      sessionPatch: { lane: "sponsors" },
    };
  }

  if (action.wantsWebsiteVersion) {
    const reply = buildVariantTag("website", state, catalog);
    return {
      reply,
      followUps: [
        { label: "Write 15-second script", send: "Write 15-second script" },
        { label: "30-second cut", send: "30-second cut" },
        { label: "TV tag", send: "TV tag" },
        { label: "Build my offer", send: "Build my offer" },
      ],
      sessionPatch: { lane: "sponsors" },
    };
  }

  if (action.wantsTvTag) {
    const reply = buildVariantTag("tv", state, catalog);
    return {
      reply,
      followUps: [
        { label: "Write 15-second script", send: "Write 15-second script" },
        { label: "30-second cut", send: "30-second cut" },
        { label: "Radio version", send: "Radio version" },
        { label: "Build my offer", send: "Build my offer" },
      ],
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Write scripts
  if (action.wants15) {
    const reply = buildScript15(state, catalog);
    return {
      reply,
      followUps: [
        { label: "Build my offer", send: "Build my offer" },
        { label: "30-second cut", send: "30-second cut" },
        { label: "Request rate card", send: "Request rate card" },
        { label: "Another sponsor", send: "Another sponsor" },
      ],
      sessionPatch: { lane: "sponsors" },
    };
  }

  if (action.wants30) {
    const reply = buildScript30(state, catalog);
    return {
      reply,
      followUps: [
        { label: "Radio version", send: "Radio version" },
        { label: "Website version", send: "Website version" },
        { label: "TV tag", send: "TV tag" },
        { label: "Build my offer", send: "Build my offer" },
      ],
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Build my offer
  if (action.wantsBuild) {
    const missing = nextMissingField(state);

    // Allow build even if we're only missing OPTIONAL fields (business/restrictions)
    const blockers = ["ask_property", "ask_goal", "ask_category", "ask_budget", "ask_cta"];
    if (blockers.includes(missing)) {
      state.stage = missing;
      setState(session, state);

      const reply = [
        "Sponsors Lane — I’m missing one piece.",
        stagePrompt(missing, session, catalog),
        "Answer that and I’ll build the offer.",
      ].join("\n");

      return {
        reply,
        followUps: makeFollowUpsForStage(missing, catalog),
        sessionPatch: { lane: "sponsors" },
      };
    }

    state.stage = "done";
    setState(session, state);

    const reply = buildOfferReply(session, state, catalog);

    return {
      reply,
      followUps: makeFollowUpsForStage("done", catalog),
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Normal progression: ask next missing field
  const nextStage = nextMissingField(state);
  state.stage = nextStage;

  // Persist
  setState(session, state);

  // If empty message, prompt nextStage
  if (!message) {
    const reply = stagePrompt(nextStage, session, catalog);
    return {
      reply,
      followUps: makeFollowUpsForStage(nextStage, catalog),
      sessionPatch: { lane: "sponsors" },
    };
  }

  // If sponsor intent (or lane already set), continue lane questions
  if (isSponsorIntent(message) || (session && session.lane === "sponsors")) {
    const reply = stagePrompt(nextStage, session, catalog);
    return {
      reply,
      followUps: makeFollowUpsForStage(nextStage, catalog),
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Fallback (should be rare if routing is correct)
  const reply = "Sponsors Lane — tell me what you want to promote: TV, Radio, Website, Social, or a bundle.";
  return {
    reply,
    followUps: makeFollowUpsForStage("ask_property", catalog),
    sessionPatch: { lane: "sponsors" },
  };
}

module.exports = {
  handleChat,
  isSponsorIntent,
};

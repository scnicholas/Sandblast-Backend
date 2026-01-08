"use strict";

/**
 * Utils/sponsorsLane.js
 *
 * Purpose:
 *  - Sponsors Lane conversational handler (Nyx-ready)
 *  - Collects minimal fields:
 *      property (tv/radio/website/social/bundle)
 *      goal (calls/foot traffic/website clicks/brand awareness)
 *      category (catalog id or "other")
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

function cleanText(s) {
  return String(s || "")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickRotate(session, key, options) {
  if (!session || !Array.isArray(options) || options.length === 0) return (options && options[0]) || "";
  const k = String(key || "rot");
  const idxKey = `_rot_${k}`;
  const last = Number(session[idxKey] || 0);
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
  return (
    t.includes("sponsor") ||
    t.includes("sponsors lane") ||
    t.includes("advertis") ||
    t.includes("rate card") ||
    t.includes("promo") ||
    t.includes("ad spot") ||
    t.includes("commercial") ||
    t.includes("campaign") ||
    t.includes("media kit")
  );
}

function normalizeGoal(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  if (t.includes("call") || t.includes("booking") || /\bbook\b/.test(t)) return "calls";
  if (t.includes("foot") || t.includes("store") || t.includes("walk-in") || t.includes("walk in")) return "foot traffic";
  if (t.includes("click") || t.includes("website") || t.includes("site")) return "website clicks";
  if (t.includes("awareness") || t.includes("brand")) return "brand awareness";

  return null;
}

function getState(session) {
  const s = session && typeof session === "object" ? session : {};
  if (!s.sponsors) s.sponsors = {};
  const st = s.sponsors;

  return {
    property: cleanText(st.property || ""), // "tv|radio|website|social|bundle"
    goal: cleanText(st.goal || ""),
    category: cleanText(st.category || ""),
    budgetTier: cleanText(st.budgetTier || ""),
    cta: cleanText(st.cta || ""),
    restrictions: cleanText(st.restrictions || ""),
    // internal flow
    stage: cleanText(st.stage || ""), // ask_property|ask_goal|ask_category|ask_budget|ask_cta|ask_restrictions|done
  };
}

function setState(session, patch) {
  if (!session || typeof session !== "object") return;
  if (!session.sponsors) session.sponsors = {};
  Object.assign(session.sponsors, patch || {});
}

function getCtaLabels(catalog) {
  const labels =
    (catalog && catalog.ctas && catalog.ctas.labels && typeof catalog.ctas.labels === "object" && catalog.ctas.labels) || {};
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

function makeFollowUpsForStage(stage, catalog) {
  const props = (catalog && catalog.properties) || { tv: true, radio: true, website: true, social: true };
  const ctaLabels = getCtaLabels(catalog);

  const tierChoices = SK.listTierChoices(); // [{id,label,range,frequency_hint}]
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
    return out.slice(0, 8);
  }

  if (stage === "ask_goal") {
    return ["Calls", "Foot traffic", "Website clicks", "Brand awareness"].map((x) => ({ label: x, send: x })).slice(0, 8);
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
    ];
  }

  if (stage === "ask_budget") {
    return tiers.slice(0, 3).map((t) => ({
      label: cleanText(t.label || t.id),
      send: cleanText(t.id || t.label), // send tier id
    }));
  }

  if (stage === "ask_cta") {
    return [
      { label: ctaLabels.book_a_call, send: "book_a_call" },
      { label: ctaLabels.request_rate_card, send: "request_rate_card" },
      { label: ctaLabels.whatsapp, send: "whatsapp" },
    ];
  }

  if (stage === "ask_restrictions") {
    return [
      { label: "No restrictions", send: "No restrictions" },
      { label: "Standard policy restrictions", send: "Standard policy restrictions" },
      { label: "I have restrictions", send: "I have restrictions" },
    ];
  }

  // done
  return [
    { label: "Build my offer", send: "Build my offer" },
    { label: "Write 15-second script", send: "Write 15-second script" },
    { label: "Request rate card", send: "Request rate card" },
    { label: "Another sponsor", send: "Another sponsor" },
  ];
}

function stagePrompt(stage, session, catalog) {
  const p = (catalog && catalog.nyx_lane_prompts) || {};
  const currency = (catalog && catalog.currency) || "CAD";

  if (stage === "ask_property") {
    return p.open || "Sponsors Lane — quick setup. What do you want to promote: TV, Radio, Website, Social, or a bundle?";
  }
  if (stage === "ask_goal") {
    return p.goal || "What’s your goal: calls, foot traffic, website clicks, or brand awareness?";
  }
  if (stage === "ask_category") {
    return p.category || "What category are you in? (restaurant, auto, grocery, church, fitness, trades, events, other)";
  }
  if (stage === "ask_budget") {
    return (
      p.budget ||
      `Budget tier in ${currency}: Starter, Growth, or Dominance? (You can also type a number like “800”.)`
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

function nextMissingField(state) {
  if (!state.property) return "ask_property";
  if (!state.goal) return "ask_goal";
  if (!state.category) return "ask_category";
  if (!state.budgetTier) return "ask_budget";
  if (!state.cta) return "ask_cta";
  // restrictions are optional; ask once, but don’t block
  if (state.stage !== "done" && !state.restrictions) return "ask_restrictions";
  return "done";
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

  // budget tier (supports explicit tier id OR numeric)
  const tier =
    (lower === "starter_test" || lower === "growth_bundle" || lower === "dominance" ? lower : null) ||
    SK.normalizeBudgetToken(t);
  if (tier) state.budgetTier = tier;

  // cta (supports explicit token or friendly phrases)
  const cta =
    (lower === "book_a_call" || lower === "request_rate_card" || lower === "whatsapp" ? lower : null) ||
    SK.normalizeCtaToken(t);
  if (cta) state.cta = cta;

  // soft-cta shortcuts
  if (lower.includes("rate card")) state.cta = "request_rate_card";
  if (lower.includes("whatsapp")) state.cta = "whatsapp";
  if (lower.includes("book") && lower.includes("call")) state.cta = "book_a_call";

  // restrictions
  if (lower.includes("no restrictions")) state.restrictions = "none";
  else if (lower.includes("standard policy")) state.restrictions = "standard";
  else if (lower.includes("i have restrictions")) state.restrictions = "custom";
  else {
    // If they typed a short sentence with "restrict", treat as custom restriction note
    if (!state.restrictions && t.length >= 8 && lower.includes("restrict")) state.restrictions = t;
  }

  // Actions (tight: avoid matching every “build” in a sentence)
  const wantsBuild =
    lower === "build my offer" ||
    /\b(build my offer|build the offer|recommend package|recommend a package|package it)\b/.test(lower);

  const wantsAnother = lower.includes("another sponsor") || lower.includes("new sponsor");

  // If they say "sponsors lane" with no other info, treat as enter-lane
  const enterLane = lower === "sponsors lane" || lower === "sponsor lane";

  return { wantsBuild, wantsAnother, enterLane };
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

function buildOfferReply(session, state, catalog) {
  const rec = SK.recommendPackage({
    property: state.property,
    tierId: state.budgetTier,
    category: state.category,
    goal: state.goal,
    cta: state.cta,
  });

  if (!rec.ok) {
    return pickRotate(session, "sponsors_offer_fail", [
      "Sponsors Lane — I can’t load the sponsors catalog right now.",
      "Tell me: TV/Radio/Website/Social + budget tier + category, and I’ll package a recommendation anyway.",
    ].join("\n"));
  }

  const currency = (catalog && catalog.currency) || rec.currency || "CAD";
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
    tiers.length
      ? `1) ${tiers[0].label}${tiers[0].range ? ` — ${tiers[0].range.min || ""}${tiers[0].range.max ? `–${tiers[0].range.max}` : ""}` : ""}`
      : "1) Starter — entry test flight",
    tiers.length > 1 ? `2) ${tiers[1].label}` : "2) Growth — repeat exposure + outcomes",
    tiers.length > 2 ? `3) ${tiers[2].label}` : "3) Dominance — segment ownership + scale",
    `Next: choose a tier, then your CTA (${ctaLabels.book_a_call} / ${ctaLabels.request_rate_card} / ${ctaLabels.whatsapp}).`,
  ];

  return lines.join("\n");
}

function handleChat({ text, session } = {}) {
  const message = cleanText(text);

  // Load catalog (safe)
  const loaded = SK.loadCatalog(SK.DEFAULT_CATALOG_REL);
  const catalog = loaded.ok ? loaded.catalog : null;

  // Force lane
  if (session && typeof session === "object") session.lane = "sponsors";

  const state = getState(session);

  // Hard reset / new sponsor
  const lower = message.toLowerCase();
  if (lower.includes("another sponsor") || lower.includes("new sponsor")) {
    setState(session, {
      property: "",
      goal: "",
      category: "",
      budgetTier: "",
      cta: "",
      restrictions: "",
      stage: "ask_property",
    });

    const reply = stagePrompt("ask_property", session, catalog);
    return {
      reply,
      followUps: makeFollowUpsForStage("ask_property", catalog),
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Rate card request (fast path)
  if (lower === "request rate card" || lower.includes("rate card") || lower.includes("media kit")) {
    // set CTA if they asked for it
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

  // Apply answer
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

  // Build my offer
  if (action.wantsBuild) {
    const missing = nextMissingField(state);
    if (missing !== "done" && missing !== "ask_restrictions") {
      state.stage = missing;
      setState(session, state);

      const reply = ["Sponsors Lane — I’m missing one piece.", stagePrompt(missing, session, catalog), "Answer that and I’ll build the offer."].join(
        "\n"
      );

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

  // Script writing
  if (lower === "write 15-second script" || lower.includes("15-second") || lower.includes("15 second") || lower.includes("write script")) {
    const ctaLabels = getCtaLabels(catalog);
    const cta = state.cta || (catalog && catalog.defaults && cleanText(catalog.defaults.cta)) || "book_a_call";
    const ctaPretty =
      (cta === "book_a_call" && ctaLabels.book_a_call) ||
      (cta === "request_rate_card" && ctaLabels.request_rate_card) ||
      (cta === "whatsapp" && ctaLabels.whatsapp) ||
      ctaLabels.book_a_call;

    const categoryPretty = prettifyCategory(catalog, state.category || "other");
    const goalPretty = state.goal || "results";

    const script = [
      "15-second sponsor script:",
      `“This hour on Sandblast is sponsored by ${categoryPretty}. If you want ${goalPretty} without the noise, get in front of the right audience. ${ctaPretty} today and lock your spot.”`,
      "Next: say “Build my offer” to package TV/Radio/Website/Social, or ask for a 30-second cut.",
    ].join("\n");

    return {
      reply: script,
      followUps: [
        { label: "Build my offer", send: "Build my offer" },
        { label: "30-second cut", send: "30-second cut" },
        { label: "Request rate card", send: "Request rate card" },
        { label: "Another sponsor", send: "Another sponsor" },
      ],
      sessionPatch: { lane: "sponsors" },
    };
  }

  // 30-second cut (simple extension)
  if (lower.includes("30-second") || lower.includes("30 second") || lower.includes("30s")) {
    const ctaLabels = getCtaLabels(catalog);
    const cta = state.cta || "book_a_call";
    const ctaPretty =
      (cta === "book_a_call" && ctaLabels.book_a_call) ||
      (cta === "request_rate_card" && ctaLabels.request_rate_card) ||
      (cta === "whatsapp" && ctaLabels.whatsapp) ||
      ctaLabels.book_a_call;

    const categoryPretty = prettifyCategory(catalog, state.category || "other");
    const goalPretty = state.goal || "results";

    const script = [
      "30-second sponsor script:",
      `“Sandblast is powered by sponsors like ${categoryPretty}. If you’re serious about ${goalPretty}, this is where you show up consistently—on-air, on-site, and in social feeds. We build a clean flight, track outcomes, and keep the message tight. ${ctaPretty} and we’ll map the best package for your budget.”`,
      "Want it tailored for Radio vs Website, or a TV tag?",
    ].join("\n");

    return {
      reply: script,
      followUps: [
        { label: "Radio version", send: "Radio version" },
        { label: "Website version", send: "Website version" },
        { label: "TV tag", send: "TV tag" },
        { label: "Build my offer", send: "Build my offer" },
      ],
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Normal progression: ask next missing field
  const nextStage = nextMissingField(state);
  state.stage = nextStage;

  // Persist
  setState(session, state);

  // If user said something sponsor-ish but didn’t provide enough, ask the next question
  if (!message) {
    const reply = stagePrompt(nextStage, session, catalog);
    return {
      reply,
      followUps: makeFollowUpsForStage(nextStage, catalog),
      sessionPatch: { lane: "sponsors" },
    };
  }

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

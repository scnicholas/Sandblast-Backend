"use strict";

/**
 * Utils/sponsorsLane.js
 *
 * Purpose:
 *  - Sponsors Lane conversational handler (Nyx-ready)
 *  - Collects minimal fields:
 *      property (tv/radio/website/social/bundle)
 *      goal (calls/foot traffic/clicks/brand awareness)
 *      category
 *      budgetTier (starter_test/growth_bundle/dominance)
 *      cta (book_a_call/request_rate_card/whatsapp)
 *      restrictions (optional free text)
 *  - Returns:
 *      reply (6–10 line, no fluff)
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
  if (!session || !Array.isArray(options) || options.length === 0) return options?.[0] || "";
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
  if (/^(y|yes|yep|yeah|sure|ok)\b/.test(t)) return true;
  if (/^(n|no|nope|nah)\b/.test(t)) return false;
  return null;
}

function isSponsorIntent(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  return (
    t.includes("sponsor") ||
    t.includes("advertis") ||
    t.includes("rate card") ||
    t.includes("promo") ||
    t.includes("ad spot") ||
    t.includes("commercial") ||
    t.includes("campaign")
  );
}

function normalizeGoal(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  if (t.includes("call") || t.includes("booking") || t.includes("book")) return "calls";
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
    property: cleanText(st.property || ""),
    goal: cleanText(st.goal || ""),
    category: cleanText(st.category || ""),
    budgetTier: cleanText(st.budgetTier || ""),
    cta: cleanText(st.cta || ""),
    restrictions: cleanText(st.restrictions || ""),
    // internal flow
    stage: cleanText(st.stage || ""), // "ask_property" | "ask_goal" | "ask_category" | "ask_budget" | "ask_cta" | "ask_restrictions" | "done"
  };
}

function setState(session, patch) {
  if (!session || typeof session !== "object") return;
  if (!session.sponsors) session.sponsors = {};
  Object.assign(session.sponsors, patch || {});
}

function makeFollowUpsForStage(stage, catalog) {
  const ctas = (catalog && catalog.ctas && catalog.ctas.labels) || {
    book_a_call: "Book a call",
    request_rate_card: "Request rate card",
    whatsapp: "WhatsApp",
  };

  const tierChoices = SK.listTierChoices();
  const tierLabels = tierChoices.map((t) => t.label || t.id);

  if (stage === "ask_property") {
    return ["TV", "Radio", "Website", "Social", "Bundle"].map((x) => ({ label: x, send: x }));
  }
  if (stage === "ask_goal") {
    return ["Calls", "Foot traffic", "Website clicks", "Brand awareness"].map((x) => ({ label: x, send: x }));
  }
  if (stage === "ask_category") {
    return [
      "Restaurant/Takeout",
      "Auto Services",
      "Grocery/Specialty",
      "Church/Faith",
      "Fitness/Wellness",
      "Trades",
      "Events",
      "Other",
    ].map((x) => ({ label: x, send: x }));
  }
  if (stage === "ask_budget") {
    const fallback = ["Starter ($250–$499)", "Growth ($500–$1,200)", "Dominance ($1,500–$3,500+)"];
    const labels = tierLabels.length ? tierLabels : fallback;
    const sends = ["starter", "growth", "dominance"];
    const out = [];
    for (let i = 0; i < Math.min(labels.length, 3); i++) {
      out.push({ label: labels[i], send: sends[i] });
    }
    return out;
  }
  if (stage === "ask_cta") {
    return [
      { label: ctas.book_a_call || "Book a call", send: "Book a call" },
      { label: ctas.request_rate_card || "Request rate card", send: "Request rate card" },
      { label: ctas.whatsapp || "WhatsApp", send: "WhatsApp" },
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
    { label: "Request rate card", send: "Request rate card" },
    { label: "Another sponsor", send: "Another sponsor" },
  ];
}

function stagePrompt(stage, session, catalog) {
  const p = (catalog && catalog.nyx_lane_prompts) || {};

  if (stage === "ask_property") {
    return p.open || "Sponsors Lane — quick setup. What do you want to promote: TV, Radio, Website, Social, or a bundle?";
  }
  if (stage === "ask_goal") {
    return p.goal || "What’s your goal: calls, foot traffic, website clicks, or brand awareness?";
  }
  if (stage === "ask_category") {
    return p.category || "What category are you in? (restaurant, auto, grocery, church, services, events, other)";
  }
  if (stage === "ask_budget") {
    return p.budget || "Budget range in CAD: Starter ($250–$499), Growth ($500–$1,200), or Dominance ($1,500–$3,500+)?";
  }
  if (stage === "ask_cta") {
    return p.cta || "Preferred CTA: Book a call, Request rate card, or WhatsApp?";
  }
  if (stage === "ask_restrictions") {
    return p.restrictions || "Any restrictions I should know? (or should I apply standard policy restrictions)";
  }

  // done
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

function applyUserAnswerToState(text, state) {
  const t = cleanText(text);

  // property
  const prop = SK.normalizePropertyToken(t);
  if (prop) {
    state.property = prop === "bundle" ? "bundle" : prop;
  }

  // goal
  const goal = normalizeGoal(t);
  if (goal) state.goal = goal;

  // category
  const cat = SK.normalizeCategoryToken(t);
  if (cat) state.category = cat;

  // budget tier
  const tier = SK.normalizeBudgetToken(t);
  if (tier) state.budgetTier = tier;

  // cta
  const cta = SK.normalizeCtaToken(t);
  if (cta) state.cta = cta;

  // restrictions
  const yn = normalizeYesNo(t);
  if (t.toLowerCase().includes("no restrictions")) state.restrictions = "none";
  if (t.toLowerCase().includes("standard policy")) state.restrictions = "standard";
  if (t.toLowerCase().includes("i have restrictions")) state.restrictions = "custom";
  if (!state.restrictions && t.length >= 8 && t.toLowerCase().includes("restrict")) state.restrictions = t;

  // If user types "build my offer", that’s an action
  const action = t.toLowerCase();
  const wantsBuild = action === "build my offer" || action.includes("build") || action.includes("recommend");
  const wantsAnother = action.includes("another sponsor") || action.includes("new sponsor");

  return { wantsBuild, wantsAnother };
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
      "I can’t load the sponsors catalog right now. Tell me: TV/Radio/Website/Social + your budget range, and I’ll still package a recommendation.",
      "Sponsors catalog didn’t load. Give me your channel + budget tier + category and I’ll draft the offer anyway.",
    ]);
  }

  const tierLine = `${rec.tierLabel} (${catalog.currency})`;
  const bundleLine = formatBundle(rec.propertyBundle);
  const goalLine = state.goal || "brand awareness";
  const ctaLabels = (catalog.ctas && catalog.ctas.labels) || {};
  const ctaPretty =
    (state.cta === "book_a_call" && (ctaLabels.book_a_call || "Book a call")) ||
    (state.cta === "request_rate_card" && (ctaLabels.request_rate_card || "Request rate card")) ||
    (state.cta === "whatsapp" && (ctaLabels.whatsapp || "WhatsApp")) ||
    "Book a call";

  const restrictLine =
    !state.restrictions || state.restrictions === "none"
      ? "Restrictions: standard policy only"
      : state.restrictions === "standard"
      ? "Restrictions: standard policy"
      : `Restrictions: ${state.restrictions}`;

  // 6–10 lines, no fluff
  const lines = [
    "Sponsors Lane — recommendation:",
    `1) Bundle: ${bundleLine}`,
    `2) Tier: ${tierLine}`,
    `3) Category: ${state.category || "other"}`,
    `4) Goal: ${goalLine}`,
    `5) CTA: ${ctaPretty}`,
    `6) Frequency: ${rec.frequencyHint || "4–7 mentions/week"}`,
    `7) ${restrictLine}`,
    "Next: say “Write 15-second script” or “Request rate card”.",
  ];

  return lines.join("\n");
}

function handleChat({ text, session } = {}) {
  const message = cleanText(text);

  // Load catalog (safe)
  const loaded = SK.loadCatalog(SK.DEFAULT_CATALOG_REL);
  const catalog = loaded.ok ? loaded.catalog : null;

  // Ensure lane
  if (session && typeof session === "object") {
    session.lane = "sponsors";
  }

  const state = getState(session);

  // If user explicitly requests a new sponsor flow, reset
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

  // Apply user answer into state (in-memory object)
  const action = applyUserAnswerToState(message, state);

  // If user asks to “build my offer”, generate recommendation immediately if we have enough
  if (action.wantsBuild) {
    const missing = nextMissingField(state);
    if (missing !== "done" && missing !== "ask_restrictions") {
      // Still missing core fields; ask next question
      state.stage = missing;
      setState(session, state);

      const reply = [
        "Sponsors Lane — I’m missing one piece.",
        stagePrompt(missing, session, catalog),
        "Give me that, and I’ll build the bundle + first script.",
      ].join("\n");

      return {
        reply,
        followUps: makeFollowUpsForStage(missing, catalog),
        sessionPatch: { lane: "sponsors" },
      };
    }

    // We have the essentials; build offer
    state.stage = "done";
    setState(session, state);

    const reply = buildOfferReply(session, state, catalog);

    return {
      reply,
      followUps: [
        { label: "Write 15-second script", send: "Write 15-second script" },
        { label: "Request rate card", send: "Request rate card" },
        { label: "Another sponsor", send: "Another sponsor" },
      ],
      sessionPatch: { lane: "sponsors" },
    };
  }

  // If user requests script writing
  if (lower.includes("15-second") || lower.includes("15 second") || lower.includes("write script")) {
    // Minimal script generator (you can extend later)
    const business = "your business";
    const cta = state.cta || (catalog && catalog.ctas && catalog.ctas.primary) || "book_a_call";
    const ctaLabels = (catalog && catalog.ctas && catalog.ctas.labels) || {};
    const ctaPretty =
      (cta === "book_a_call" && (ctaLabels.book_a_call || "Book a call")) ||
      (cta === "request_rate_card" && (ctaLabels.request_rate_card || "Request rate card")) ||
      (cta === "whatsapp" && (ctaLabels.whatsapp || "WhatsApp")) ||
      "Book a call";

    const script = [
      "15-second sponsor script:",
      `“This hour is sponsored by ${business}. If you want ${state.goal || "results"} without the noise, go where the locals go. ${ctaPretty} today and get on the calendar.”`,
      "Want a tighter version for Radio vs Website, or a 30-second cut?",
    ].join("\n");

    return {
      reply: script,
      followUps: [
        { label: "Radio version", send: "Radio version" },
        { label: "Website version", send: "Website version" },
        { label: "30-second cut", send: "30-second cut" },
        { label: "Another sponsor", send: "Another sponsor" },
      ],
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Normal lane progression: ask next missing field
  const nextStage = nextMissingField(state);
  state.stage = nextStage;

  // Persist state back into session
  setState(session, state);

  // If this is first entry into sponsors lane and user didn’t provide anything yet,
  // ask property first.
  if (!message && nextStage === "ask_property") {
    const reply = stagePrompt("ask_property", session, catalog);
    return {
      reply,
      followUps: makeFollowUpsForStage("ask_property", catalog),
      sessionPatch: { lane: "sponsors" },
    };
  }

  // If user message had sponsor intent but we still need fields, respond with the next question.
  if (isSponsorIntent(message) || session.lane === "sponsors") {
    const reply = stagePrompt(nextStage, session, catalog);
    return {
      reply,
      followUps: makeFollowUpsForStage(nextStage, catalog),
      sessionPatch: { lane: "sponsors" },
    };
  }

  // Fallback (should rarely hit if routed correctly)
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

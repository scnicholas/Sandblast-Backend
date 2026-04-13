"use strict";

/**
 * ChatPolicies.js
 * Sandblast / Nyx unified policy layer
 *
 * Purpose:
 * - centralize policy families outside chatEngine.js
 * - absorb deterministic lanePolicy.js so the external lane policy file can be removed
 * - preserve strict precedence and stop clarification from overpowering fulfillment
 */

const POLICY_VERSION = "ChatPolicies v1.2.0";

/* ------------------------------------------------------------------ */
/* Utilities                                                          */
/* ------------------------------------------------------------------ */

function asString(v) {
  return typeof v === "string" ? v : "";
}

function lower(v) {
  return asString(v).trim().toLowerCase();
}

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function clampText(v, max = 280) {
  const s = asString(v).trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max).trim() : s;
}

function uniqBy(items, keyFn) {
  const out = [];
  const seen = new Set();
  for (const item of arr(items)) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeYear(text) {
  const m = asString(text).match(/\b(19[4-9]\d|20[0-2]\d)\b/);
  return m ? Number(m[1]) : null;
}

function hasAny(text, list) {
  const t = lower(text);
  return arr(list).some((token) => t.includes(lower(token)));
}

function safeNow() {
  return Date.now();
}

/* ------------------------------------------------------------------ */
/* Defaults                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_LANE = "general";

const KNOWN_LANES = new Set([
  "general",
  "music",
  "news",
  "radio",
  "roku",
  "movies",
  "support",
  "business",
  "knowledge",
  "sponsors",
  "schedule"
]);

const DEFAULT_POLICY_RESULT = Object.freeze({
  ok: true,
  version: POLICY_VERSION,
  stop: false,
  reason: "",
  lane: DEFAULT_LANE,
  action: null,
  resolver: null,
  bridgeMode: null,
  clarificationNeeded: false,
  clarificationPrompt: "",
  shouldUseEmotionFirst: false,
  shouldUseGreeting: false,
  shouldUseBridge: false,
  shouldRouteToMarion: true,
  decisionAuthority: "marion",
  shouldSanitizePublic: false,
  shouldSuppressFollowUps: false,
  shouldSuppressAutoplay: false,
  shouldBlockDuplicate: false,
  inferredSlots: {},
  chipRoute: null,
  notes: []
});

/* ------------------------------------------------------------------ */
/* Public entry                                                       */
/* ------------------------------------------------------------------ */

function evaluatePolicies(context = {}) {
  const base = makeBaseContext(context);
  let result = clonePolicyResult();

  result = mergePolicy(result, evaluateLoopPolicy(base, result));
  if (result.stop) return finalizePolicyResult(base, result);

  result = mergePolicy(result, evaluateEmotionPolicy(base, result));
  if (result.stop) return finalizePolicyResult(base, result);

  result = mergePolicy(result, evaluateGreetingPolicy(base, result));
  if (result.stop) return finalizePolicyResult(base, result);

  result = mergePolicy(result, evaluateLanePolicy(base, result));
  result = mergePolicy(result, evaluateChipPolicy(base, result));
  result = mergePolicy(result, evaluateBridgePolicy(base, result));
  result = mergePolicy(result, evaluateClarificationPolicy(base, result));
  result = mergePolicy(result, evaluatePublicModePolicy(base, result));

  return finalizePolicyResult(base, result);
}

/* ------------------------------------------------------------------ */
/* Context shaping                                                    */
/* ------------------------------------------------------------------ */

function makeBaseContext(context = {}) {
  const text = clampText(context.text || context.message || "", 1200);
  const session = isObject(context.session) ? context.session : {};
  const inbound = isObject(context.inbound) ? context.inbound : {};
  const chips = arr(context.chips);
  const directives = arr(context.directives);
  const recentReplies = arr(context.recentReplies);
  const emotionSignals = isObject(context.emotionSignals) ? context.emotionSignals : {};
  const supportSignals = isObject(context.supportSignals) ? context.supportSignals : {};
  const requestMeta = isObject(context.requestMeta) ? context.requestMeta : {};
  const publicMode = !!context.publicMode;

  const activeLaneRaw =
    context.activeLane ||
    session.activeLane ||
    session.lane ||
    inbound.activeLane ||
    session.currentLane ||
    DEFAULT_LANE;

  const activeLane = KNOWN_LANES.has(activeLaneRaw) ? activeLaneRaw : DEFAULT_LANE;

  return {
    text,
    textLower: lower(text),
    session,
    inbound,
    chips,
    directives,
    recentReplies,
    emotionSignals,
    supportSignals,
    requestMeta,
    publicMode,
    activeLane,
    now: safeNow()
  };
}

function clonePolicyResult() {
  return JSON.parse(JSON.stringify(DEFAULT_POLICY_RESULT));
}

function mergePolicy(current, incoming) {
  if (!incoming || typeof incoming !== "object") return current;

  return {
    ...current,
    ...incoming,
    inferredSlots: {
      ...(current.inferredSlots || {}),
      ...(incoming.inferredSlots || {})
    },
    notes: [...arr(current.notes), ...arr(incoming.notes)]
  };
}

function finalizePolicyResult(base, result) {
  const finalLane = KNOWN_LANES.has(result.lane) ? result.lane : base.activeLane || DEFAULT_LANE;

  return {
    ...result,
    version: POLICY_VERSION,
    lane: finalLane,
    notes: uniqBy(arr(result.notes), (x) => String(x)).slice(0, 12),
    inferredSlots: isObject(result.inferredSlots) ? result.inferredSlots : {},
    clarificationPrompt: clampText(result.clarificationPrompt || "", 180),
    action: result.action || null,
    resolver: result.resolver || null,
    bridgeMode: result.bridgeMode || null,
    chipRoute: isObject(result.chipRoute) ? result.chipRoute : null
  };
}

/* ------------------------------------------------------------------ */
/* 1) Loop Policy                                                     */
/* ------------------------------------------------------------------ */

function evaluateLoopPolicy(base) {
  const text = base.textLower;
  const recentReplies = base.recentReplies;

  const out = { notes: [] };

  const sameAsLastInbound =
    lower(base.session.lastUserText || "") &&
    lower(base.session.lastUserText || "") === text;

  if (sameAsLastInbound && base.requestMeta?.retry === true) {
    out.shouldBlockDuplicate = true;
    out.stop = true;
    out.reason = "duplicate_inbound_retry";
    out.notes.push("Blocked duplicate retry turn.");
    return out;
  }

  const repeatedFallbackPattern = recentReplies.some((reply) => {
    const s = lower(reply?.reply || reply?.text || "");
    return (
      s.includes("exact target") ||
      s.includes("stay with that path") ||
      s.includes("without bouncing you into a menu")
    );
  });

  if (repeatedFallbackPattern) {
    out.notes.push("Detected prior generic fallback loop pattern.");
  }

  if (text && text === lower(base.session.lastResolvedText || "")) {
    out.shouldBlockDuplicate = true;
    out.reason = "same_as_last_resolved_text";
    out.notes.push("Inbound matched last resolved text.");
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 2) Emotion Policy                                                  */
/* ------------------------------------------------------------------ */

function evaluateEmotionPolicy(base) {
  const t = base.textLower;
  const distress =
    !!base.emotionSignals.distress ||
    !!base.supportSignals.distress ||
    hasAny(t, [
      "i am hurting",
      "i'm hurting",
      "i feel hopeless",
      "i want to give up",
      "i am not okay",
      "panic attack",
      "i can't do this anymore"
    ]);

  const crisis =
    !!base.emotionSignals.crisis ||
    !!base.supportSignals.crisis ||
    hasAny(t, [
      "suicide",
      "kill myself",
      "end my life",
      "harm myself",
      "hurt myself"
    ]);

  const out = { notes: [] };

  if (crisis) {
    out.shouldUseEmotionFirst = true;
    out.stop = true;
    out.reason = "crisis_override";
    out.lane = "support";
    out.action = "support_crisis";
    out.resolver = "supportResolver";
    out.notes.push("Crisis override engaged.");
    return out;
  }

  if (distress) {
    out.shouldUseEmotionFirst = true;
    out.lane = "support";
    out.action = "support_distress";
    out.resolver = "supportResolver";
    out.notes.push("Distress support priority engaged.");
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 3) Greeting Policy                                                 */
/* ------------------------------------------------------------------ */

function evaluateGreetingPolicy(base, current) {
  const out = { notes: [] };

  if (current.shouldUseEmotionFirst) {
    out.notes.push("Greeting policy demoted due to support priority.");
    return out;
  }

  const greetingOnly =
    /^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup|hiya)\b[!.? ]*$/i.test(base.text);

  if (greetingOnly) {
    out.shouldUseGreeting = true;
    out.action = "greeting";
    out.resolver = "greetingResolver";
    out.notes.push("Pure greeting detected.");
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 4) Lane Policy (absorbed deterministic resolver)                   */
/* ------------------------------------------------------------------ */

const LANE_PATTERNS = {
  sponsors: [
    /\bsponsor\b/,
    /\badvertis(e|ing|er|ement)\b/,
    /\bmarketing\b/,
    /\bpromot(e|ion)\b/,
    /\bmedia\s*buy\b/,
    /\brates?\b/,
    /\bpricing\b/,
    /\bpackages?\b/,
    /\bbook\s*(a\s*)?call\b/
  ],
  schedule: [
    /\bschedule\b/,
    /\bwhat('?s|\s+is)\s+playing\b/,
    /\bplaying\s+now\b/,
    /\bwhat\s+time\b/,
    /\bwhen\s+(does|is)\b/,
    /\bair(s|ing)?\b/,
    /\btonight\b/,
    /\bnow\b/
  ],
  movies: [
    /\bmovie(s)?\b/,
    /\bfilm(s)?\b/,
    /\btv\s*show(s)?\b/,
    /\bseries\b/,
    /\bwatch\b/,
    /\bstream\b/,
    /\bepisode(s)?\b/,
    /\bseason(s)?\b/,
    /\bchannel\b/,
    /\broku\b/
  ],
  music: [
    /\btop\s*10\b/,
    /\btop10\b/,
    /\btop\s*ten\b/,
    /\bstory\s*moment\b/,
    /\bmicro\s*moment\b/,
    /\b#\s*1\b/,
    /\bnumber\s*1\b/,
    /\bno\.?\s*1\b/,
    /\bchart(s)?\b/,
    /\bsong(s)?\b/,
    /\bmusic\b/,
    /\bradio\b/,
    /\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/
  ],
  news: [
    /\bnews\b/,
    /\bheadline(s)?\b/,
    /\bcanada\s+news\b/,
    /\bworld\s+news\b/
  ]
};

function resolveDeterministicLane({ text, session }) {
  const t = lower(text);
  const s = session || {};

  for (const rx of LANE_PATTERNS.sponsors) {
    if (rx.test(t)) return { lane: "sponsors", reason: "pattern:sponsors", confidence: 1 };
  }

  for (const rx of LANE_PATTERNS.schedule) {
    if (rx.test(t)) return { lane: "schedule", reason: "pattern:schedule", confidence: 0.98 };
  }

  for (const rx of LANE_PATTERNS.movies) {
    if (rx.test(t)) return { lane: "movies", reason: "pattern:movies", confidence: 0.96 };
  }

  for (const rx of LANE_PATTERNS.music) {
    if (rx.test(t)) return { lane: "music", reason: "pattern:music", confidence: 0.95 };
  }

  for (const rx of LANE_PATTERNS.news) {
    if (rx.test(t)) return { lane: "news", reason: "pattern:news", confidence: 0.93 };
  }

  if (s.lane === "music" || s.activeLane === "music") {
    return { lane: "music", reason: "session:music_sticky", confidence: 0.84, inherited: true };
  }
  if (s.lane === "movies" || s.activeLane === "movies") {
    return { lane: "movies", reason: "session:movies_sticky", confidence: 0.84, inherited: true };
  }
  if (s.lane === "sponsors" || s.activeLane === "sponsors") {
    return { lane: "sponsors", reason: "session:sponsors_sticky", confidence: 0.84, inherited: true };
  }
  if (s.lane === "schedule" || s.activeLane === "schedule") {
    return { lane: "schedule", reason: "session:schedule_sticky", confidence: 0.84, inherited: true };
  }

  return { lane: "general", reason: "fallback", confidence: 0.4 };
}

function evaluateLanePolicy(base) {
  const out = {
    lane: base.activeLane,
    notes: []
  };

  const resolved = resolveDeterministicLane({ text: base.text, session: base.session });
  if (resolved?.lane) {
    out.lane = resolved.lane;
    out.notes.push(`Lane resolved: ${resolved.reason}`);
  }

  if (base.activeLane !== DEFAULT_LANE) {
    const terseCarryForward =
      !!normalizeYear(base.text) ||
      hasAny(base.textLower, [
        "top 10",
        "#1",
        "number one",
        "story moment",
        "micro moment",
        "another year",
        "next year"
      ]);

    if (terseCarryForward && ["music", "movies", "news", "radio", "roku"].includes(base.activeLane)) {
      out.lane = base.activeLane;
      out.notes.push(`Inherited active lane: ${base.activeLane}`);
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 5) Chip Policy                                                     */
/* ------------------------------------------------------------------ */

function evaluateChipPolicy(base, current) {
  const out = { notes: [] };

  const chipRoute = inferChipRoute(base.chips, base.text, current.lane, base.session);
  if (!chipRoute) return out;

  out.chipRoute = chipRoute;
  out.notes.push(`Chip route inferred: ${chipRoute.action || "unknown_action"}`);

  if (!current.action && chipRoute.action) out.action = chipRoute.action;
  if (!current.resolver && chipRoute.resolver) out.resolver = chipRoute.resolver;
  if (chipRoute.lane) out.lane = chipRoute.lane;
  if (chipRoute.slots) out.inferredSlots = { ...chipRoute.slots };

  return out;
}

function inferChipRoute(chips, text, lane, session) {
  const t = lower(text);
  const year = normalizeYear(text) || session?.lockedYear || null;

  if (lane === "music") {
    if (hasAny(t, ["top 10", "top ten"])) {
      return {
        lane: "music",
        action: "music_top10_by_year",
        resolver: "musicResolver",
        slots: year ? { year } : {}
      };
    }

    if (hasAny(t, ["#1", "number one"])) {
      return {
        lane: "music",
        action: "music_number_one_by_year",
        resolver: "musicResolver",
        slots: year ? { year } : {}
      };
    }

    if (hasAny(t, ["story moment"])) {
      return {
        lane: "music",
        action: "music_story_moment_by_year",
        resolver: "musicResolver",
        slots: year ? { year } : {}
      };
    }

    if (hasAny(t, ["micro moment"])) {
      return {
        lane: "music",
        action: "music_micro_moment_by_year",
        resolver: "musicResolver",
        slots: year ? { year } : {}
      };
    }

    if (year && chips.some((c) => lower(c?.label || c?.text || "").includes("pick a year"))) {
      return {
        lane: "music",
        action: "music_top10_by_year",
        resolver: "musicResolver",
        slots: { year }
      };
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* 6) Bridge Policy                                                   */
/* ------------------------------------------------------------------ */

function evaluateBridgePolicy(base, current) {
  const out = { notes: [] };
  const t = base.textLower;

  const knowledgeSignal =
    current.lane === "knowledge" ||
    hasAny(t, [
      "explain",
      "analyze",
      "compare",
      "legal",
      "finance",
      "psychology",
      "cybersecurity",
      "operational intelligence"
    ]);

  const supportDeepening =
    current.lane === "support" &&
    hasAny(t, ["why do i feel", "help me understand", "what does this mean", "walk me through"]);

  if (knowledgeSignal) {
    out.shouldUseBridge = true;
    out.bridgeMode = "knowledge";
    out.notes.push("Knowledge bridge requested.");
    return out;
  }

  if (supportDeepening) {
    out.shouldUseBridge = true;
    out.bridgeMode = "support";
    out.notes.push("Support bridge requested.");
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 7) Clarification Policy                                            */
/* ------------------------------------------------------------------ */

function evaluateClarificationPolicy(base, current) {
  const out = { notes: [] };

  if (current.action && current.resolver) {
    out.notes.push("Clarification skipped because action is already resolved.");
    return out;
  }

  const t = base.textLower;
  const year = normalizeYear(base.text) || current.inferredSlots?.year || base.session?.lockedYear || null;

  if (current.lane === "music") {
    if (hasAny(t, ["top 10", "top ten"]) && year) {
      out.action = "music_top10_by_year";
      out.resolver = "musicResolver";
      out.inferredSlots = { year };
      out.notes.push("Resolved music top 10 by year without clarification.");
      return out;
    }

    if (hasAny(t, ["#1", "number one"]) && year) {
      out.action = "music_number_one_by_year";
      out.resolver = "musicResolver";
      out.inferredSlots = { year };
      out.notes.push("Resolved music #1 by year without clarification.");
      return out;
    }

    if (hasAny(t, ["story moment"]) && year) {
      out.action = "music_story_moment_by_year";
      out.resolver = "musicResolver";
      out.inferredSlots = { year };
      out.notes.push("Resolved story moment by year without clarification.");
      return out;
    }

    if (hasAny(t, ["micro moment"]) && year) {
      out.action = "music_micro_moment_by_year";
      out.resolver = "musicResolver";
      out.inferredSlots = { year };
      out.notes.push("Resolved micro moment by year without clarification.");
      return out;
    }

    if (year && /^top\s*10\b/i.test(base.text)) {
      out.action = "music_top10_by_year";
      out.resolver = "musicResolver";
      out.inferredSlots = { year };
      out.notes.push("Resolved compact top 10 request.");
      return out;
    }

    if (hasAny(t, ["top 10", "top ten", "#1", "number one", "story moment", "micro moment"]) && !year) {
      out.clarificationNeeded = true;
      out.clarificationPrompt = "Give me the year and I will run it.";
      out.notes.push("Music clarification requested for missing year.");
      return out;
    }
  }

  if (current.lane === "news" && !current.action) {
    out.action = "news_headlines";
    out.resolver = "newsResolver";
    out.notes.push("Defaulted news lane to headlines.");
    return out;
  }

  if (current.lane === "radio" && hasAny(t, ["play", "start", "radio"])) {
    out.action = "radio_start";
    out.resolver = "radioResolver";
    out.notes.push("Resolved radio start.");
    return out;
  }

  if ((current.lane === "roku" || current.lane === "movies") && hasAny(t, ["classics", "open", "launch", "channel"])) {
    out.action = "roku_navigation";
    out.resolver = "rokuResolver";
    out.notes.push("Resolved roku navigation.");
    return out;
  }

  if (!current.action && !current.resolver) {
    out.clarificationNeeded = true;
    out.clarificationPrompt = "Give me the lane or target and I will take it straight there.";
    out.notes.push("Fallback clarification requested.");
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 8) Public Mode Policy                                              */
/* ------------------------------------------------------------------ */

function evaluatePublicModePolicy(base, current) {
  const out = { notes: [] };
  if (!base.publicMode) return out;

  out.shouldSanitizePublic = true;
  out.notes.push("Public sanitization enabled.");

  if (current.lane === "support") {
    out.shouldSuppressAutoplay = true;
    out.notes.push("Autoplay suppressed in public support mode.");
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Engine integration helper                                          */
/* ------------------------------------------------------------------ */

function buildPolicyEnvelope(context = {}) {
  const policy = evaluatePolicies(context);

  return {
    ok: true,
    source: "ChatPolicies",
    version: POLICY_VERSION,
    lane: policy.lane,
    action: policy.action,
    resolver: policy.resolver,
    bridgeMode: policy.bridgeMode,
    clarificationNeeded: policy.clarificationNeeded,
    clarificationPrompt: policy.clarificationPrompt,
    flags: {
      shouldUseEmotionFirst: !!policy.shouldUseEmotionFirst,
      shouldUseGreeting: !!policy.shouldUseGreeting,
      shouldUseBridge: !!policy.shouldUseBridge,
      shouldRouteToMarion: policy.shouldRouteToMarion !== false,
      shouldSanitizePublic: !!policy.shouldSanitizePublic,
      shouldSuppressFollowUps: !!policy.shouldSuppressFollowUps,
      shouldSuppressAutoplay: !!policy.shouldSuppressAutoplay,
      shouldBlockDuplicate: !!policy.shouldBlockDuplicate
    },
    inferredSlots: policy.inferredSlots || {},
    chipRoute: policy.chipRoute || null,
    stop: !!policy.stop,
    reason: policy.reason || "",
    decisionAuthority: policy.decisionAuthority || "marion",
    notes: arr(policy.notes)
  };
}

function shouldDeferToMarion(context = {}) {
  const envelope = buildPolicyEnvelope(context);
  return {
    ok: true,
    version: POLICY_VERSION,
    shouldRouteToMarion: envelope.flags.shouldRouteToMarion !== false,
    decisionAuthority: envelope.decisionAuthority || "marion",
    lane: envelope.lane,
    stop: envelope.stop,
    reason: envelope.reason
  };
}

module.exports = {
  POLICY_VERSION,
  evaluatePolicies,
  buildPolicyEnvelope,
  evaluateLoopPolicy,
  evaluateEmotionPolicy,
  evaluateGreetingPolicy,
  evaluateLanePolicy,
  evaluateChipPolicy,
  evaluateBridgePolicy,
  evaluateClarificationPolicy,
  evaluatePublicModePolicy,
  normalizeYear,
  inferChipRoute,
  resolveDeterministicLane,
  shouldDeferToMarion,
  LANE_PATTERNS
};

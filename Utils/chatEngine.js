"use strict";

/**
 * Utils/chatEngine.js
 *
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *
 * Returns (NyxReplyContract v1 + backwards compatibility):
 *  {
 *    ok, reply, lane, ctx, ui,
 *    directives: [{type, ...}],             // optional
 *    followUps: [{id,type,label,payload}],  // preferred
 *    followUpsStrings: ["..."],             // legacy
 *    sessionPatch, cog, requestId, meta
 *  }
 *
 * v0.7bH (TOP10 COMPLETION GUARD++++):
 * ✅ Adds Top10 Completion Guard: if pinned Top10 returns <10 rows, auto-complete from Year-End Hot100 (same year) when available.
 * ✅ De-dupes by (title|artist) signature and fills positions deterministically to 10.
 * ✅ Keeps ALL critical components unchanged: Marion mediator, Mac Mode signal, turn constitution, compression budgets,
 *          payload beats silence, chip-click advance, pinned aliases, accurate miss reasons,
 *          year-end route, loop dampener, derived guard default OFF, 3-act followUps, session keys.
 */

const CE_VERSION =
  "chatEngine v0.7bH (TOP10 COMPLETION GUARD++++ + TOP10 VISIBILITY FIX++++ + COG MEDIATOR++++ + MAC MODE SIGNAL++++ + TURN CONSTITUTION++++ + payload beats silence + chip-click advance + pinned aliases + accurate miss reasons + year-end route + loop dampener)";

// -------------------------
// helpers
// -------------------------
function nowMs() {
  return Date.now();
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype ||
      Object.getPrototypeOf(x) === null)
  );
}
function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}
function sha1Lite(str) {
  // small stable hash (NOT cryptographic) for loop signatures
  const s = safeStr(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function normYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1900 || t > 2100) return null;
  return t;
}
function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function truthy(v) {
  if (v === true) return true;
  const s = safeStr(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}
function compactList(items, maxN) {
  const arr = Array.isArray(items) ? items : [];
  return arr.slice(0, maxN);
}
function normalizeSongLine(r) {
  const o = isPlainObject(r) ? r : {};
  const pos = clampInt(
    o.pos ?? o.rank ?? o.position ?? o["#"] ?? o.no ?? o.number,
    null,
    1,
    500
  );
  const title = safeStr(o.title ?? o.song ?? o.single ?? o.track ?? "").trim();
  const artist = safeStr(o.artist ?? o.artists ?? o.performer ?? "").trim();
  return { pos: pos || null, title, artist };
}
function extractYearFromText(t) {
  const s = safeStr(t).trim();
  if (!s) return null;
  const m = s.match(/\b(19[5-9]\d|20[0-2]\d|2025)\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return normYear(y);
}
function normVibe(v) {
  const s = safeStr(v).trim().toLowerCase();
  if (!s) return "";
  if (s.includes("rom")) return "romantic";
  if (s.includes("reb")) return "rebellious";
  if (s.includes("nos")) return "nostalgic";
  return s;
}
function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}
function splitLines(s) {
  return safeStr(s).split("\n");
}
function takeLines(s, maxLines) {
  const lines = splitLines(s);
  return lines.slice(0, Math.max(1, maxLines)).join("\n").trim();
}
function countNumberedLines(text) {
  const lines = splitLines(text);
  let n = 0;
  for (const ln of lines) {
    if (/^\s*\d+\.\s+/.test(ln)) n++;
  }
  return n;
}
function applyBudgetText(s, budget) {
  // budget: "short" | "medium"
  // FIX: ranked lists (Top 10 / Hot 100 excerpts) must not be cut to Top 4.
  const txt = safeStr(s).trim();
  if (!txt) return "";

  const numbered = countNumberedLines(txt);

  // If it's a ranked list, keep enough lines to show the list meaningfully.
  // Top 10 format typically needs: header + blank + 10 rows = 12 lines.
  // Year-end excerpts (20 rows) needs more; budget will still cap it.
  if (numbered >= 6) {
    if (budget === "short") return takeLines(txt, 16); // safely covers Top 10
    return takeLines(txt, 28); // covers 20-row excerpt comfortably
  }

  // Non-list copy: tighter.
  if (budget === "short") return takeLines(txt, 6);
  return takeLines(txt, 14);
}

// -------------------------
// config
// -------------------------
const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2025;

// -------------------------
// inbound parse / intent
// -------------------------
function classifyAction(text, payload) {
  const t = safeStr(text).toLowerCase();
  const pA = safeStr(payload?.action || "").trim();
  if (pA) return pA;

  if (/\b(top\s*10|top ten)\b/.test(t)) return "top10";
  if (/\b(#\s*1|number\s*1|number one|no\.\s*1)\b/.test(t)) return "number1";
  if (/\b(story\s*moment|make it cinematic|cinematic)\b/.test(t))
    return "story_moment";
  if (/\b(micro\s*moment|tap micro|seal the vibe)\b/.test(t))
    return "micro_moment";
  if (
    /\b(year[-\s]*end|year end|yearend)\b/.test(t) &&
    /\bhot\s*100\b/.test(t)
  )
    return "yearend_hot100";

  if (t === "__cmd:reset__" || /\b(reset|start over|clear session)\b/.test(t))
    return "reset";
  if (/\b(pick another year|another year|new year)\b/.test(t)) return "ask_year";
  if (/\b(switch lane|change lane|other lane)\b/.test(t))
    return "switch_lane";

  const hasVibe = /\b(romantic|rebellious|nostalgic)\b/.test(t);
  if (
    hasVibe &&
    (/\b(story|moment|cinematic)\b/.test(t) || /\b(make it|give me)\b/.test(t))
  )
    return "custom_story";

  return "";
}

function normalizeMacModeRaw(v) {
  const s = safeStr(v).trim().toLowerCase();
  if (!s) return "";
  if (s === "architect" || s === "builder" || s === "dev") return "architect";
  if (s === "user" || s === "viewer" || s === "consumer") return "user";
  if (s === "transitional" || s === "mixed" || s === "both") return "transitional";
  return "";
}

function detectMacModeImplicit(text) {
  const t = safeStr(text).trim();
  if (!t) return { mode: "", scoreA: 0, scoreU: 0, scoreT: 0, why: [] };

  const s = t.toLowerCase();
  let a = 0,
    u = 0,
    tr = 0;
  const why = [];

  // Architect signals
  if (/\b(let's|lets)\s+(define|design|lock|implement|encode|ship|wire)\b/.test(s)) {
    a += 3; why.push("architect:lets-define/design");
  }
  if (/\b(non[-\s]?negotiable|must|hard rule|lock this in|constitution|mediator|pipeline|governor|decision table)\b/.test(s)) {
    a += 3; why.push("architect:constraints/architecture");
  }
  if (/\b(step\s*\d+|1\s*,\s*2\s*,\s*3|1\s*2\s*3)\b/.test(s) || /\b\d+\)\s/.test(s)) {
    a += 2; why.push("architect:enumeration");
  }
  if (/\b(index\.js|chatengine\.js|render|cors|session|payload|json|endpoint|route|resolver|pack)\b/.test(s)) {
    a += 2; why.push("architect:technical");
  }

  // User signals
  if (/\b(i('?m)?\s+not\s+sure|help\s+me\s+understand|does\s+this\s+make\s+sense|where\s+do\s+i|get\s+the\s+url)\b/.test(s)) {
    u += 3; why.push("user:uncertainty/how-to");
  }
  if (/\b(confused|stuck|frustrated|overwhelmed|worried)\b/.test(s)) {
    u += 2; why.push("user:emotion");
  }

  // Transitional signals (mixed)
  if (a > 0 && u > 0) {
    tr += 3; why.push("transitional:mixed-signals");
  }

  let mode = "";
  if (tr >= 3) mode = "transitional";
  else if (a >= u + 2) mode = "architect";
  else if (u >= a + 2) mode = "user";
  else mode = ""; // uncertain -> let mediator default

  return { mode, scoreA: a, scoreU: u, scoreT: tr, why };
}

function classifyTurnIntent(text, action, hasPayload, payloadAction, payloadYear, textEmpty) {
  const s = safeStr(text).trim().toLowerCase();
  const hasAction = !!safeStr(action).trim();

  // ADVANCE is dominant when the turn is actionable (payload beats silence)
  if (hasAction) return "ADVANCE";
  if (hasPayload && (payloadAction || payloadYear !== null)) return "ADVANCE";
  if (textEmpty && hasPayload) return "ADVANCE";

  // CLARIFY
  if (/\b(explain|how do i|how to|what is|walk me through|where do i|get|why)\b/.test(s))
    return "CLARIFY";

  // STABILIZE
  if (/\b(i('?m)?\s+stuck|i('?m)?\s+worried|overwhelmed|frustrated|anxious)\b/.test(s))
    return "STABILIZE";

  // Default
  return "CLARIFY";
}

function normalizeInbound(input) {
  const body = isPlainObject(input) ? input : {};
  const payload = isPlainObject(body.payload) ? body.payload : {};
  const ctx = isPlainObject(body.ctx) ? body.ctx : {};
  const client = isPlainObject(body.client) ? body.client : {};

  const textRaw = safeStr(
    body.text ||
      body.message ||
      body.prompt ||
      body.query ||
      payload.text ||
      payload.message ||
      ""
  ).trim();

  // PAYLOAD BEATS SILENCE: treat chip clicks as real turns even when text is empty
  const payloadAction = safeStr(payload.action || body.action || ctx.action || "").trim();
  const inferredAction = classifyAction(textRaw, payload);
  const action = payloadAction || inferredAction || "";

  const payloadYear =
    normYear(payload.year) ?? normYear(body.year) ?? normYear(ctx.year) ?? null;

  const year =
    payloadYear ??
    extractYearFromText(textRaw) ??
    null;

  const lane = safeStr(body.lane || payload.lane || ctx.lane || "").trim();

  const vibe = safeStr(payload.vibe || body.vibe || ctx.vibe || "").trim() || "";

  const allowDerivedTop10 =
    truthy(payload.allowDerivedTop10) ||
    truthy(body.allowDerivedTop10) ||
    truthy(ctx.allowDerivedTop10) ||
    truthy(payload.allowYearendFallback) ||
    truthy(body.allowYearendFallback) ||
    truthy(ctx.allowYearendFallback);

  const textEmpty = !safeStr(textRaw).trim();
  const hasPayload = isPlainObject(payload) && Object.keys(payload).length > 0;

  // MAC MODE signal (optional explicit override)
  const macModeOverride =
    normalizeMacModeRaw(payload.macMode || payload.mode || body.macMode || body.mode || ctx.macMode || ctx.mode || "") || "";

  const implicit = detectMacModeImplicit(textRaw);
  const macMode = macModeOverride || implicit.mode || "";

  const turnIntent = classifyTurnIntent(
    textRaw,
    action,
    hasPayload,
    payloadAction || "",
    payloadYear,
    textEmpty
  );

  return {
    body,
    payload,
    ctx,
    client,
    text: textRaw,
    lane,
    year,
    action,
    vibe,
    allowDerivedTop10,
    macMode,
    macModeOverride,
    macModeWhy: implicit.why || [],
    turnIntent,
    turnSignals: {
      hasPayload,
      payloadAction: payloadAction || "",
      payloadYear: payloadYear ?? null,
      textEmpty,
      effectiveAction: action || "",
      effectiveYear: year ?? null,
      macMode: macMode || "",
      macModeOverride: macModeOverride || "",
      turnIntent: turnIntent || "",
    },
  };
}

// -------------------------
// COG MEDIATOR (“Marion”)
// -------------------------
function mediatorMarion(norm, session) {
  const s = isPlainObject(session) ? session : {};
  const lastIntent = safeStr(s.lastTurnIntent || "").trim().toUpperCase();
  const lastAt = Number(s.lastTurnAt || 0) || 0;
  const lastAdvanceAt = Number(s.lastAdvanceAt || 0) || 0;

  const hasPayload = !!norm.turnSignals?.hasPayload;
  const textEmpty = !!norm.turnSignals?.textEmpty;

  // Mode: default to ARCHITECT when uncertain (per your rule)
  let mode = safeStr(norm.macMode || "").trim().toLowerCase();
  if (!mode) mode = "architect";
  if (mode !== "architect" && mode !== "user" && mode !== "transitional") mode = "architect";

  // Momentum: if we haven't advanced in a while, push ADVANCE
  const now = nowMs();
  const stalled = lastAdvanceAt ? now - lastAdvanceAt > 90 * 1000 : false; // 90s heuristic

  // Intent: use normalized, but enforce constitution
  let intent = safeStr(norm.turnIntent || "").trim().toUpperCase();
  if (intent !== "ADVANCE" && intent !== "CLARIFY" && intent !== "STABILIZE") intent = "CLARIFY";

  // Kill-switch: circularity / softness creep → force ADVANCE when actionable or stalled
  const actionable =
    !!safeStr(norm.action).trim() ||
    (hasPayload && (norm.turnSignals.payloadAction || norm.turnSignals.payloadYear !== null));
  if ((stalled && (mode === "architect" || mode === "transitional")) && intent !== "ADVANCE") {
    intent = actionable ? "ADVANCE" : "CLARIFY";
  }
  if (actionable) intent = "ADVANCE"; // constitution: action wins

  // Dominance & budget
  let dominance = "neutral"; // firm | neutral | soft
  let budget = "medium"; // short | medium

  if (mode === "architect") {
    budget = "short";
    dominance = intent === "ADVANCE" ? "firm" : "neutral";
  } else if (mode === "transitional") {
    budget = "short";
    dominance = intent === "ADVANCE" ? "firm" : "neutral";
  } else {
    budget = "medium";
    dominance = intent === "ADVANCE" ? "neutral" : "soft";
  }

  // Micro grounding allowance (1 line max unless STABILIZE)
  const grounding = mode === "user" || mode === "transitional";
  const groundingMaxLines = intent === "STABILIZE" ? 3 : grounding ? 1 : 0;

  return {
    mode,
    intent,
    dominance,
    budget,
    stalled,
    lastIntent,
    lastAt,
    groundingMaxLines,
    actionable,
    textEmpty,
  };
}

function applyTurnConstitutionToReply(rawReply, cog) {
  // Enforce compression + reduce “option sprawl” on ADVANCE in architect/transitional.
  let reply = safeStr(rawReply).trim();
  if (!reply) return "";

  // Budget-based compression (with ranked-list protection in applyBudgetText)
  reply = applyBudgetText(reply, cog.budget);

  // If ADVANCE + firm, remove trailing “let me know / if you want” softness (keep Nyx warmth elsewhere)
  if (cog.intent === "ADVANCE" && cog.dominance === "firm") {
    reply = reply
      .replace(/\b(if you want|if you'd like|let me know)\b.*$/i, "")
      .trim();
  }

  return reply;
}

// -------------------------
// knowledge accessors (aliases + scan)
// -------------------------
function getJsonRoot(knowledge) {
  const k = isPlainObject(knowledge) ? knowledge : {};
  return isPlainObject(k.json) ? k.json : {};
}

function getPack(knowledge, key) {
  const json = getJsonRoot(knowledge);
  return json[key];
}

function getPackAny(knowledge, keys) {
  for (const k of asArray(keys)) {
    const hit = getPack(knowledge, k);
    if (hit) return { pack: hit, key: k, method: "alias_key" };
  }
  return { pack: null, key: "", method: "" };
}

function looksLikeTop10Store(obj) {
  // Accept common shapes:
  //  - { years: { "1992": { items:[...] } } }   (your canonical top10_by_year_v1.json)
  //  - { byYear: { "1992": [...] } }
  //  - { "1992": [...] }
  //  - { rows:[{year,pos,title,artist}, ...] }
  if (!obj) return false;
  if (isPlainObject(obj.years)) return true;
  if (isPlainObject(obj.byYear)) return true;
  if (Array.isArray(obj.rows)) return true;

  const keys = isPlainObject(obj) ? Object.keys(obj) : [];
  if (keys.some((k) => /^\d{4}$/.test(k) && Array.isArray(obj[k]))) return true;
  return false;
}

function findTop10PackHeuristic(knowledge) {
  const json = getJsonRoot(knowledge);
  const entries = Object.entries(json);

  const ranked = entries
    .map(([k, v]) => {
      const lk = k.toLowerCase();
      let score = 0;
      if (lk.includes("top10_by_year")) score += 50;
      if (lk.includes("top10")) score += 20;
      if (lk.includes("music")) score += 10;
      if (lk.includes("wiki")) score -= 5; // don't accidentally pick wiki year-end
      if (looksLikeTop10Store(v)) score += 30;
      return { k, v, score };
    })
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score);

  if (ranked.length) return { pack: ranked[0].v, key: ranked[0].k, method: "heuristic_scan" };
  return { pack: null, key: "", method: "" };
}

function getPinnedTop10(knowledge) {
  const aliases = [
    "music/top10_by_year",
    "music/top10_by_year_v1",
    "music/top10_by_year_store",
    "music/top10_by_year_v1.json",
    "music/top10_store",
    "music/top10",
    "top10_by_year_v1",
    "top10_by_year",
  ];

  const a = getPackAny(knowledge, aliases);
  if (a.pack && looksLikeTop10Store(a.pack)) return { pack: a.pack, key: a.key, foundBy: a.method };

  const h = findTop10PackHeuristic(knowledge);
  if (h.pack) return { pack: h.pack, key: h.key, foundBy: h.method };

  return { pack: null, key: "", foundBy: "" };
}

function getPinnedNumber1(knowledge) {
  const aliases = [
    "music/number1_by_year",
    "music/number1_by_year_v1",
    "music/number1_by_year_v1.json",
    "music/number1",
    "number1_by_year",
  ];
  const a = getPackAny(knowledge, aliases);
  return a.pack ? { pack: a.pack, key: a.key, foundBy: a.method } : { pack: null, key: "", foundBy: "" };
}

function getPinnedStoryMoments(knowledge) {
  const aliases = [
    "music/story_moments_by_year",
    "music/story_moments_by_year_v1",
    "music/story_moments_by_year_v2",
    "music/story_moments",
  ];
  const a = getPackAny(knowledge, aliases);
  return a.pack ? { pack: a.pack, key: a.key, foundBy: a.method } : { pack: null, key: "", foundBy: "" };
}

function getPinnedMicroMoments(knowledge) {
  const aliases = [
    "music/micro_moments_by_year",
    "music/micro_moments_by_year_v1",
    "music/micro_moments_by_year_v2",
    "music/micro_moments",
  ];
  const a = getPackAny(knowledge, aliases);
  return a.pack ? { pack: a.pack, key: a.key, foundBy: a.method } : { pack: null, key: "", foundBy: "" };
}

function getWikiYearendByYear(knowledge) {
  const aliases = [
    "music/wiki/yearend_hot100_by_year",
    "music/wiki/yearend_hot100_by_year_v1",
    "music/wiki/yearend_hot100",
  ];
  const a = getPackAny(knowledge, aliases);
  return a.pack ? { pack: a.pack, key: a.key, foundBy: a.method } : { pack: null, key: "", foundBy: "" };
}

// -------------------------
// TOP10 COMPLETION GUARD (minimal, non-invasive)
// -------------------------
function sigSongKey(r) {
  const t = safeStr(r?.title || "").trim().toLowerCase();
  const a = safeStr(r?.artist || "").trim().toLowerCase();
  return `${t}|${a}`;
}
function sortByPosThenIndex(items) {
  const arr = asArray(items).slice();
  return arr.sort((x, y) => {
    const ax = Number(x?.pos || 9999);
    const ay = Number(y?.pos || 9999);
    if (ax !== ay) return ax - ay;
    return 0;
  });
}
function dedupeByTitleArtist(items) {
  const out = [];
  const seen = new Set();
  for (const r of asArray(items)) {
    const k = sigSongKey(r);
    // If both missing, still allow as unique by object identity-ish:
    const kk = k === "|" ? `__blank__:${out.length}` : k;
    if (seen.has(kk)) continue;
    seen.add(kk);
    out.push(r);
  }
  return out;
}
function normalizeTop10List(items) {
  // normalize + sort + de-dupe, but DO NOT invent rows here.
  const normed = asArray(items).map(normalizeSongLine).filter((r) => r.title || r.artist);
  const deduped = dedupeByTitleArtist(normed);
  return sortByPosThenIndex(deduped);
}
function completeTop10IfShort(knowledge, year, baseItems) {
  const y = normYear(year);
  const base = normalizeTop10List(baseItems);
  if (!y) return { items: base.slice(0, 10), completed: false, used: "none" };
  if (base.length >= 10) {
    // ensure 1..10 pos is sensible
    const out = base.slice(0, 10).map((r, i) => ({ ...r, pos: r.pos || i + 1 }));
    return { items: out, completed: false, used: "none" };
  }

  // Try to complete from year-end Hot100 (same year). This is additive only.
  const yr = resolveYearendHot100ForYear(knowledge, y);
  if (!yr.ok || !Array.isArray(yr.items) || !yr.items.length) {
    const out = base.map((r, i) => ({ ...r, pos: r.pos || i + 1 }));
    return { items: out.slice(0, 10), completed: false, used: "none", yearendOk: false };
  }

  const seen = new Set(base.map(sigSongKey));
  const merged = base.slice();
  for (const r0 of yr.items) {
    if (merged.length >= 10) break;
    const r = normalizeSongLine(r0);
    if (!r.title && !r.artist) continue;
    const k = sigSongKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(r);
  }

  const final = normalizeTop10List(merged).slice(0, 10).map((r, i) => ({ ...r, pos: r.pos || i + 1 }));
  return {
    items: final,
    completed: final.length >= 10,
    used: final.length > base.length ? "yearend_merge" : "none",
    yearendSourceKey: yr.sourceKey || "",
    yearendFoundBy: yr.foundBy || "",
  };
}

// -------------------------
// resolvers
// -------------------------
function resolveTop10ForYear(knowledge, year, opts) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const allowDerivedTop10 = !!(opts && opts.allowDerivedTop10);

  const top10Hit = getPinnedTop10(knowledge);
  const top10 = top10Hit.pack;

  if (top10) {
    if (isPlainObject(top10.years)) {
      const block = top10.years[String(y)];
      if (!block)
        return { ok: false, reason: "year_missing_in_pack", sourceKey: top10Hit.key, foundBy: top10Hit.foundBy };
      const items = asArray(block.items).map(normalizeSongLine).filter((r) => r.title || r.artist);
      if (!items.length)
        return { ok: false, reason: "empty_items_for_year", sourceKey: top10Hit.key, foundBy: top10Hit.foundBy };
      return {
        ok: true,
        method: "pinned_top10_years_items",
        sourceKey: top10Hit.key,
        foundBy: top10Hit.foundBy,
        year: y,
        items,
      };
    }

    if (isPlainObject(top10.byYear)) {
      const arr = top10.byYear[String(y)];
      if (!arr)
        return { ok: false, reason: "year_missing_in_pack", sourceKey: top10Hit.key, foundBy: top10Hit.foundBy };
      const items = asArray(arr).map(normalizeSongLine).filter((r) => r.title || r.artist);
      if (!items.length)
        return { ok: false, reason: "empty_items_for_year", sourceKey: top10Hit.key, foundBy: top10Hit.foundBy };
      return { ok: true, method: "pinned_top10_byYear_array", sourceKey: top10Hit.key, foundBy: top10Hit.foundBy, year: y, items };
    }

    if (isPlainObject(top10) && Array.isArray(top10[String(y)])) {
      const items = top10[String(y)].map(normalizeSongLine).filter((r) => r.title || r.artist);
      if (!items.length)
        return { ok: false, reason: "empty_items_for_year", sourceKey: top10Hit.key, foundBy: top10Hit.foundBy };
      return {
        ok: true,
        method: "pinned_top10_year_keyed_array",
        sourceKey: top10Hit.key,
        foundBy: top10Hit.foundBy,
        year: y,
        items,
      };
    }

    if (Array.isArray(top10.rows)) {
      const rows = top10.rows.filter((r) => Number(r?.year) === y);
      if (!rows.length)
        return { ok: false, reason: "year_missing_in_pack", sourceKey: top10Hit.key, foundBy: top10Hit.foundBy };
      const items = rows.map(normalizeSongLine).filter((r) => r.title || r.artist);
      if (!items.length)
        return { ok: false, reason: "empty_items_for_year", sourceKey: top10Hit.key, foundBy: top10Hit.foundBy };
      return { ok: true, method: "pinned_top10_rows", sourceKey: top10Hit.key, foundBy: top10Hit.foundBy, year: y, items };
    }

    return { ok: false, reason: "unsupported_pack_shape", sourceKey: top10Hit.key, foundBy: top10Hit.foundBy };
  }

  // NO pinned top10 pack discovered anywhere
  if (!allowDerivedTop10) {
    return { ok: false, reason: "missing_pack_no_fallback" };
  }

  // FALLBACK ONLY if explicitly allowed
  const wikiHit = getWikiYearendByYear(knowledge);
  const wiki = wikiHit.pack;

  if (wiki && isPlainObject(wiki.byYear) && Array.isArray(wiki.byYear[String(y)])) {
    const rows = wiki.byYear[String(y)];
    const items = rows
      .map((r) => {
        const o = normalizeSongLine(r);
        if (!o.title) o.title = safeStr(r.song || r.single || r.track || "").trim();
        if (!o.artist) o.artist = safeStr(r.artist || r.performer || "").trim();
        if (!o.pos) o.pos = clampInt(r.rank ?? r.pos ?? r.position, null, 1, 500);
        return o;
      })
      .filter((r) => r.title || r.artist);

    if (items.length) {
      const sorted = items
        .slice()
        .sort((a, b) => Number(a.pos || 9999) - Number(b.pos || 9999))
        .slice(0, 10);

      return {
        ok: true,
        method: "fallback_yearend_hot100_top10",
        sourceKey: wikiHit.key,
        foundBy: wikiHit.foundBy,
        year: y,
        items: sorted,
        confidence: "medium",
      };
    }
  }

  return { ok: false, reason: "not_found" };
}

function resolveYearendHot100ForYear(knowledge, year) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const wikiHit = getWikiYearendByYear(knowledge);
  const wiki = wikiHit.pack;
  if (!wiki) return { ok: false, reason: "missing_pack" };

  const byYear = isPlainObject(wiki.byYear) ? wiki.byYear : null;
  const rows = byYear && Array.isArray(byYear[String(y)]) ? byYear[String(y)] : null;
  if (!rows) return { ok: false, reason: "year_missing_in_pack", sourceKey: wikiHit.key, foundBy: wikiHit.foundBy };

  const items = rows
    .map((r) => {
      const o = normalizeSongLine(r);
      if (!o.title) o.title = safeStr(r.song || r.single || r.track || "").trim();
      if (!o.artist) o.artist = safeStr(r.artist || r.performer || "").trim();
      if (!o.pos) o.pos = clampInt(r.rank ?? r.pos ?? r.position, null, 1, 500);
      return o;
    })
    .filter((r) => r.title || r.artist)
    .sort((a, b) => Number(a.pos || 9999) - Number(b.pos || 9999));

  if (!items.length) return { ok: false, reason: "empty_items_for_year", sourceKey: wikiHit.key, foundBy: wikiHit.foundBy };

  return {
    ok: true,
    method: "wiki_yearend_hot100_byYear",
    sourceKey: wikiHit.key,
    foundBy: wikiHit.foundBy,
    year: y,
    items,
    confidence: "high",
  };
}

function resolveNumber1ForYear(knowledge, year) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const hit = getPinnedNumber1(knowledge);
  const p = hit.pack;
  if (!p) return { ok: false, reason: "missing_pack" };

  if (Array.isArray(p.rows)) {
    const row = p.rows.find((r) => Number(r?.year) === y);
    if (row) {
      const o = normalizeSongLine(row);
      return { ok: true, method: "pinned_rows", sourceKey: hit.key, foundBy: hit.foundBy, year: y, item: o };
    }
  }

  if (isPlainObject(p.byYear) && (isPlainObject(p.byYear[String(y)]) || Array.isArray(p.byYear[String(y)]))) {
    const v = p.byYear[String(y)];
    const row = Array.isArray(v) ? v[0] : v;
    const o = normalizeSongLine(row);
    return { ok: true, method: "pinned_byYear", sourceKey: hit.key, foundBy: hit.foundBy, year: y, item: o };
  }

  if (isPlainObject(p[String(y)]) || Array.isArray(p[String(y)])) {
    const v = p[String(y)];
    const row = Array.isArray(v) ? v[0] : v;
    const o = normalizeSongLine(row);
    return { ok: true, method: "pinned_year_key", sourceKey: hit.key, foundBy: hit.foundBy, year: y, item: o };
  }

  return { ok: false, reason: "not_found" };
}

function resolveStoryMomentForYear(knowledge, year) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const hit = getPinnedStoryMoments(knowledge);
  const p = hit.pack;
  if (!p) return { ok: false, reason: "missing_pack" };

  const getText = (r) => safeStr(r?.text || r?.moment || r?.story || r?.copy || r?.line || "").trim();

  if (Array.isArray(p.rows)) {
    const row = p.rows.find((r) => Number(r?.year) === y);
    const txt = row ? getText(row) : "";
    if (txt) return { ok: true, method: "pinned_rows", sourceKey: hit.key, foundBy: hit.foundBy, year: y, text: txt };
  }
  if (isPlainObject(p.byYear) && p.byYear[String(y)]) {
    const txt = getText(p.byYear[String(y)]);
    if (txt) return { ok: true, method: "pinned_byYear", sourceKey: hit.key, foundBy: hit.foundBy, year: y, text: txt };
  }
  if (p[String(y)]) {
    const v = p[String(y)];
    const row = Array.isArray(v) ? v[0] : v;
    const txt = getText(row);
    if (txt) return { ok: true, method: "pinned_year_key", sourceKey: hit.key, foundBy: hit.foundBy, year: y, text: txt };
  }

  return { ok: false, reason: "not_found" };
}

function resolveMicroMomentForYear(knowledge, year) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const hit = getPinnedMicroMoments(knowledge);
  const p = hit.pack;
  if (!p) return { ok: false, reason: "missing_pack" };

  const getText = (r) => safeStr(r?.text || r?.moment || r?.micro || r?.copy || r?.line || "").trim();

  if (Array.isArray(p.rows)) {
    const row = p.rows.find((r) => Number(r?.year) === y);
    const txt = row ? getText(row) : "";
    if (txt) return { ok: true, method: "pinned_rows", sourceKey: hit.key, foundBy: hit.foundBy, year: y, text: txt };
  }
  if (isPlainObject(p.byYear) && p.byYear[String(y)]) {
    const txt = getText(p.byYear[String(y)]);
    if (txt) return { ok: true, method: "pinned_byYear", sourceKey: hit.key, foundBy: hit.foundBy, year: y, text: txt };
  }
  if (p[String(y)]) {
    const v = p[String(y)];
    const row = Array.isArray(v) ? v[0] : v;
    const txt = getText(row);
    if (txt) return { ok: true, method: "pinned_year_key", sourceKey: hit.key, foundBy: hit.foundBy, year: y, text: txt };
  }

  return { ok: false, reason: "not_found" };
}

// -------------------------
// loop dampener
// -------------------------
function buildMusicSig({ action, year, method, sourceKey, extra }) {
  const base = `${safeStr(action)}|${safeStr(year)}|${safeStr(method)}|${safeStr(sourceKey)}|${safeStr(extra)}`;
  return sha1Lite(base).slice(0, 12);
}
function shouldDampen(session, nextSig) {
  const s = isPlainObject(session) ? session : {};
  const last = safeStr(s.__musicLastSig || "").trim();
  if (!last) return false;
  return last === safeStr(nextSig);
}

// -------------------------
// followUps (3 acts)
// -------------------------
function threeActFollowUps(year) {
  const y = normYear(year);
  const yLabel = y ? String(y) : "that year";

  const followUps = [
    { id: "fu_number1", type: "chip", label: "“Want the #1 anchor next?”", payload: { lane: "music", action: "number1", year: y || undefined, route: "number1" } },
    { id: "fu_story", type: "chip", label: "“Okay… now we make it cinematic.”", payload: { lane: "music", action: "story_moment", year: y || undefined, route: "story_moment" } },
    { id: "fu_micro", type: "chip", label: "“Tap micro moment—let’s seal the vibe.”", payload: { lane: "music", action: "micro_moment", year: y || undefined, route: "micro_moment" } },
  ];

  const followUpsStrings = [
    `Want the #1 anchor next for ${yLabel}?`,
    `Okay… now we make it cinematic.`,
    `Tap micro moment—let’s seal the vibe.`,
  ];

  return { followUps, followUpsStrings };
}

// -------------------------
// formatting
// -------------------------
function formatTop10(year, items) {
  const y = normYear(year);
  const list = compactList(items, 10).map((r, i) => {
    const pos = r.pos || i + 1;
    const title = r.title ? `“${r.title}”` : "“(title unknown)”";
    const artist = r.artist ? ` — ${r.artist}` : "";
    return `${pos}. ${title}${artist}`;
  });
  const head = y ? `Top 10 — ${y}` : `Top 10`;
  return `${head}\n\n${list.join("\n")}`;
}

function formatYearendHot100(year, items, maxN) {
  const y = normYear(year);
  const n = clampInt(maxN, 10, 5, 100);
  const list = compactList(items, n).map((r, i) => {
    const pos = r.pos || i + 1;
    const title = r.title ? `“${r.title}”` : "“(title unknown)”";
    const artist = r.artist ? ` — ${r.artist}` : "";
    return `${pos}. ${title}${artist}`;
  });
  const head = y ? `Billboard Year-End Hot 100 — ${y}` : `Billboard Year-End Hot 100`;
  return `${head}\n\n${list.join("\n")}`;
}

function formatNumber1(year, item) {
  const y = normYear(year);
  const title = safeStr(item?.title || "").trim();
  const artist = safeStr(item?.artist || "").trim();
  if (!title && !artist)
    return y ? `#1 — ${y}\n\nI don’t have a clean #1 anchor for this year yet.` : `I don’t have a clean #1 anchor yet.`;
  return `#1 — ${y}\n\n“${title || "(title unknown)"}” — ${artist || "(artist unknown)"}`;
}

function formatInlineAnchor(item) {
  const title = safeStr(item?.title || "").trim();
  const artist = safeStr(item?.artist || "").trim();
  if (!title && !artist) return "";
  return `Quick anchor (so we don’t lose momentum): “${title || "(title unknown)"}” — ${artist || "(artist unknown)"}`;
}

function buildCustomStory({ year, vibe, number1Item }) {
  const y = normYear(year);
  const v = normVibe(vibe) || "nostalgic";
  const title = safeStr(number1Item?.title || "").trim();
  const artist = safeStr(number1Item?.artist || "").trim();
  const anchor = title || artist ? `“${title || "(title)"}” — ${artist || "(artist)"}` : "";

  const open = y ? `${y}.` : `That year.`;
  const aLine = anchor ? `The needle drops on ${anchor} — ` : `The needle drops — `;

  if (v === "romantic") {
    return (
      `${open} ${aLine}` +
      `and suddenly the room feels softer at the edges. Streetlights look like candlelight, and even your silence has a melody. ` +
      `It’s the kind of year that makes you text first… then pretend you didn’t.`
    );
  }
  if (v === "rebellious") {
    return (
      `${open} ${aLine}` +
      `and your posture changes. You stop asking permission, stop apologizing for taking up space. ` +
      `This is a year for leather-jacket confidence, for loud truths, for leaving the party early because you run the night.`
    );
  }
  return (
    `${open} ${aLine}` +
    `and memory does that gentle time-warp thing. A car radio, a kitchen speaker, a hallway dance with socks on. ` +
    `Not perfect—just *yours*. That’s why it sticks.`
  );
}

// -------------------------
// main engine
// -------------------------
async function handleChat(input) {
  const started = nowMs();
  const norm = normalizeInbound(input);

  const session = isPlainObject(norm.body.session)
    ? norm.body.session
    : isPlainObject(input?.session)
    ? input.session
    : {};

  const knowledge = isPlainObject(input?.knowledge)
    ? input.knowledge
    : isPlainObject(norm.body.knowledge)
    ? norm.body.knowledge
    : {};

  // Marion mediation (COG OS)
  const cog = mediatorMarion(norm, session);

  const yearSticky = normYear(session.lastYear) ?? null;

  // PAYLOAD YEAR BEATS STICKY YEAR (chip click should override prior context)
  const year = norm.year ?? yearSticky ?? null;

  const lane =
    safeStr(norm.lane || "").trim() ||
    (norm.action ? "music" : "") ||
    safeStr(session.lane || "").trim() ||
    "general";

  const prevChart = safeStr(session.activeMusicChart || session.lastMusicChart || "").trim();

  // Common session telemetry patch (kept small and safe)
  const baseCogPatch = {
    lastMacMode: cog.mode,
    lastTurnIntent: cog.intent,
    lastTurnAt: nowMs(),
    ...(cog.intent === "ADVANCE" ? { lastAdvanceAt: nowMs() } : {}),
  };

  if (norm.action === "reset") {
    return {
      ok: true,
      reply: "",
      lane: "general",
      sessionPatch: {
        lane: "general",
        lastYear: null,
        lastMode: null,
        lastMusicYear: null,
        __musicLastSig: "",
        activeMusicChart: "",
        lastMusicChart: "",
        musicMomentsLoaded: false,
        musicMomentsLoadedAt: 0,
        ...baseCogPatch,
      },
      cog,
      meta: {
        engine: CE_VERSION,
        resetHint: true,
        turnSignals: norm.turnSignals,
        elapsedMs: nowMs() - started,
      },
    };
  }

  if (norm.action === "ask_year") {
    const replyRaw = `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}). I’ll start with Top 10 — or you can pick #1, story, or micro.`;
    return {
      ok: true,
      reply: applyTurnConstitutionToReply(replyRaw, cog),
      lane: "music",
      followUps: [
        { id: "fu_1973", type: "chip", label: "1973", payload: { lane: "music", action: "top10", year: 1973 } },
        { id: "fu_1988", type: "chip", label: "1988", payload: { lane: "music", action: "top10", year: 1988 } },
        { id: "fu_1992", type: "chip", label: "1992", payload: { lane: "music", action: "top10", year: 1992 } },
      ],
      followUpsStrings: ["1973", "1988", "1992"],
      sessionPatch: { lane: "music", ...baseCogPatch },
      cog,
      meta: { engine: CE_VERSION, route: "ask_year", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

  if (norm.action === "switch_lane") {
    const replyRaw = `Pick a lane:\n\n• Music\n• Movies\n• Sponsors`;
    return {
      ok: true,
      reply: applyTurnConstitutionToReply(replyRaw, cog),
      lane: "general",
      followUps: [
        { id: "fu_music", type: "chip", label: "Music", payload: { lane: "music" } },
        { id: "fu_movies", type: "chip", label: "Movies", payload: { lane: "movies" } },
        { id: "fu_sponsors", type: "chip", label: "Sponsors", payload: { lane: "sponsors" } },
      ],
      followUpsStrings: ["Music", "Movies", "Sponsors"],
      sessionPatch: { lane: "general", ...baseCogPatch },
      cog,
      meta: { engine: CE_VERSION, route: "switch_lane", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

  const requiresYear = ["top10", "number1", "story_moment", "micro_moment", "yearend_hot100", "custom_story"];

  // CHIP-CLICK ADVANCE: if action is present via payload, do NOT misfire "need year" unless year truly absent
  if (requiresYear.includes(norm.action) && !year) {
    const replyRaw = `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`;
    return {
      ok: true,
      reply: applyTurnConstitutionToReply(replyRaw, cog),
      lane: "music",
      followUps: [
        { id: "fu_1973", type: "chip", label: "1973", payload: { lane: "music", action: norm.action || "top10", year: 1973 } },
        { id: "fu_1988", type: "chip", label: "1988", payload: { lane: "music", action: norm.action || "top10", year: 1988 } },
        { id: "fu_1960", type: "chip", label: "1960", payload: { lane: "music", action: norm.action || "top10", year: 1960 } },
      ],
      followUpsStrings: ["1973", "1988", "1960"],
      sessionPatch: { lane: "music", ...baseCogPatch },
      cog,
      meta: { engine: CE_VERSION, needYear: true, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

  if (year && (year < PUBLIC_MIN_YEAR || year > PUBLIC_MAX_YEAR)) {
    const replyRaw = `Use a year in ${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}.`;
    return {
      ok: true,
      reply: applyTurnConstitutionToReply(replyRaw, cog),
      lane: "music",
      sessionPatch: { lane: "music", ...baseCogPatch },
      cog,
      meta: { engine: CE_VERSION, outOfRange: true, year, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

  // Dominance requirement: if ambiguous and we're in ADVANCE + architect/transitional, choose a sane default
  // (Avoid option sprawl; push forward.)
  const action = norm.action || (lane === "music" && year ? "top10" : "");

  // ---------------------------------
  // MUSIC
  // ---------------------------------
  if (lane === "music" || action) {
    if (action === "custom_story") {
      const v = normVibe(norm.vibe || norm.text) || "nostalgic";
      const n1 = resolveNumber1ForYear(knowledge, year);
      const sig = buildMusicSig({
        action: "custom_story",
        year,
        method: n1.ok ? n1.method : "templated",
        sourceKey: n1.ok ? n1.sourceKey : "none",
        extra: v,
      });

      const acts = threeActFollowUps(year);

      if (shouldDampen(session, sig)) {
        const replyRaw = `Switch the lens. Pick: #1 anchor, Top 10, or micro moment.`;
        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: acts.followUps,
          followUpsStrings: acts.followUpsStrings,
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "custom_story",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...baseCogPatch,
          },
          cog,
          meta: { engine: CE_VERSION, route: "custom_story", dampened: true, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      const story = buildCustomStory({ year, vibe: v, number1Item: n1.ok ? n1.item : null });
      const replyRaw = `Okay… now we make it cinematic.\n\n${story}`;
      return {
        ok: true,
        reply: applyTurnConstitutionToReply(replyRaw, cog),
        lane: "music",
        followUps: [
          { id: "fu_micro", type: "chip", label: "“Tap micro moment—let’s seal the vibe.”", payload: { lane: "music", action: "micro_moment", year } },
          { id: "fu_n1", type: "chip", label: `#1 for ${year}`, payload: { lane: "music", action: "number1", year } },
          { id: "fu_top10", type: "chip", label: `Top 10 for ${year}`, payload: { lane: "music", action: "top10", year } },
        ],
        followUpsStrings: ["Tap micro moment—let’s seal the vibe.", `#1 for ${year}`, `Top 10 for ${year}`],
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "custom_story",
          musicMomentsLoaded: true,
          musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || nowMs(),
          ...baseCogPatch,
        },
        cog,
        meta: { engine: CE_VERSION, route: "custom_story", vibe: v, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
      };
    }

    if (action === "yearend_hot100") {
      // Explicit request: OK to use wiki year-end as authority for this route.
      const res = resolveYearendHot100ForYear(knowledge, year);
      const sig = buildMusicSig({
        action: "yearend_hot100",
        year,
        method: res.method || "none",
        sourceKey: res.sourceKey || "none",
        extra: "v1",
      });

      if (!res.ok) {
        let why = `Year-end Hot 100 for ${year} isn’t available right now.`;
        if (res.reason === "missing_pack") why = `I can’t find the wiki year-end Hot 100 by-year pack in knowledge.`;
        if (res.reason === "year_missing_in_pack") why = `I found the year-end pack, but ${year} is missing inside it.`;
        if (res.reason === "empty_items_for_year") why = `I found ${year}, but the rows are empty (bad ingest / cache gap).`;

        const debug =
          res.sourceKey || res.foundBy
            ? `\n\n(Yearend probe: key=${safeStr(res.sourceKey || "n/a")} foundBy=${safeStr(res.foundBy || "n/a")})`
            : "";

        const replyRaw = `${why}${debug}\n\nNext: run pinned Top 10 for ${year}.`;
        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: [
            { id: "fu_top10", type: "chip", label: `Top 10 for ${year}`, payload: { lane: "music", action: "top10", year } },
            { id: "fu_n1", type: "chip", label: `#1 for ${year}`, payload: { lane: "music", action: "number1", year } },
          ],
          followUpsStrings: [`Top 10 for ${year}`, `#1 for ${year}`],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "yearend_hot100",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...baseCogPatch,
          },
          cog,
          meta: { engine: CE_VERSION, route: "yearend_hot100", found: false, reason: res.reason, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      if (shouldDampen(session, sig)) {
        const replyRaw = `Already served year-end for ${year}. Next: pinned Top 10 or #1 anchor.`;
        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: [
            { id: "fu_top10", type: "chip", label: `Top 10 for ${year}`, payload: { lane: "music", action: "top10", year } },
            { id: "fu_n1", type: "chip", label: `#1 for ${year}`, payload: { lane: "music", action: "number1", year } },
          ],
          followUpsStrings: [`Top 10 for ${year}`, `#1 for ${year}`],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "yearend_hot100",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...baseCogPatch,
          },
          cog,
          meta: { engine: CE_VERSION, route: "yearend_hot100", dampened: true, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      const replyRaw = formatYearendHot100(year, res.items, 20);
      return {
        ok: true,
        reply: applyTurnConstitutionToReply(replyRaw, cog),
        lane: "music",
        followUps: [
          { id: "fu_top10", type: "chip", label: `Top 10 for ${year} (pinned)`, payload: { lane: "music", action: "top10", year } },
          { id: "fu_n1", type: "chip", label: `#1 for ${year}`, payload: { lane: "music", action: "number1", year } },
          { id: "fu_story", type: "chip", label: "“Okay… now we make it cinematic.”", payload: { lane: "music", action: "story_moment", year } },
        ],
        followUpsStrings: [`Top 10 for ${year} (pinned)`, `#1 for ${year}`, `Okay… now we make it cinematic.`],
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "yearend_hot100",
          musicMomentsLoaded: !!session.musicMomentsLoaded,
          musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
          ...baseCogPatch,
        },
        cog,
        meta: {
          engine: CE_VERSION,
          route: "yearend_hot100",
          method: res.method,
          sourceKey: res.sourceKey,
          foundBy: res.foundBy,
          confidence: res.confidence || "high",
          musicSig: sig,
          turnSignals: norm.turnSignals,
          elapsedMs: nowMs() - started,
        },
      };
    }

    if (action === "top10") {
      const res = resolveTop10ForYear(knowledge, year, { allowDerivedTop10: norm.allowDerivedTop10 });

      if (!res.ok) {
        const n1 = resolveNumber1ForYear(knowledge, year);
        const n1Line = n1.ok ? formatInlineAnchor(n1.item) : "";

        let why = `Top 10 for ${year} isn’t available yet.`;
        if (res.reason === "missing_pack_no_fallback") {
          why = `Pinned Top 10 store is missing. I’m refusing year-end derivation (loop prevention).`;
        } else if (res.reason === "year_missing_in_pack") {
          why = `Top 10 store is present, but ${year} is missing inside it.`;
        } else if (res.reason === "empty_items_for_year") {
          why = `${year} exists in the store, but items are empty (build gap).`;
        } else if (res.reason === "unsupported_pack_shape") {
          why = `Top 10 pack found, but the shape isn’t supported yet.`;
        }

        const acts = threeActFollowUps(year);
        const debug =
          res.sourceKey || res.foundBy
            ? `\n\n(Top10 probe: key=${safeStr(res.sourceKey || "n/a")} foundBy=${safeStr(res.foundBy || "n/a")})`
            : "";

        const replyRaw =
          `${why}\n\n` +
          (n1Line ? `${n1Line}\n\n` : "") +
          `Next move: pick #1, story, or micro.` +
          debug;

        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: acts.followUps,
          followUpsStrings: acts.followUpsStrings,
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            lastMusicChart: prevChart,
            activeMusicChart: "",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...baseCogPatch,
          },
          cog,
          meta: {
            engine: CE_VERSION,
            route: "top10",
            found: false,
            reason: res.reason,
            allowDerivedTop10: !!norm.allowDerivedTop10,
            turnSignals: norm.turnSignals,
            elapsedMs: nowMs() - started,
          },
        };
      }

      // TOP10 COMPLETION GUARD (non-invasive): if <10 rows, complete from year-end hot100
      const completion = completeTop10IfShort(knowledge, year, res.items);
      const finalItems = completion.items;

      const sig = buildMusicSig({
        action: "top10",
        year,
        method: res.method,
        sourceKey: res.sourceKey,
        extra: completion.used === "yearend_merge" ? "v1+yearend" : "v1",
      });

      const acts = threeActFollowUps(year);

      if (shouldDampen(session, sig)) {
        const replyRaw =
          `Same Top 10 beat for ${year}. Switch gears:\n` +
          `• #1 anchor\n` +
          `• story moment\n` +
          `• micro moment`;
        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: acts.followUps,
          followUpsStrings: acts.followUpsStrings,
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "top10",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...baseCogPatch,
          },
          cog,
          meta: {
            engine: CE_VERSION,
            route: "top10",
            dampened: true,
            musicSig: sig,
            musicChartKey: "top10",
            method: res.method,
            sourceKey: res.sourceKey,
            foundBy: res.foundBy,
            top10Completed: !!completion.completed,
            top10CompletionUsed: completion.used || "none",
            top10CompletionYearendKey: completion.yearendSourceKey || "",
            turnSignals: norm.turnSignals,
            elapsedMs: nowMs() - started,
          },
        };
      }

      const replyRaw = formatTop10(year, finalItems);
      const microPack = !!getPinnedMicroMoments(knowledge).pack;
      const momentsLoaded = !!session.musicMomentsLoaded || microPack;
      const momentsLoadedAt = Number(session.musicMomentsLoadedAt || 0) || (microPack ? nowMs() : 0);

      return {
        ok: true,
        reply: applyTurnConstitutionToReply(replyRaw, cog),
        lane: "music",
        followUps: acts.followUps,
        followUpsStrings: acts.followUpsStrings,
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "top10",
          musicMomentsLoaded: momentsLoaded,
          musicMomentsLoadedAt: momentsLoadedAt,
          ...baseCogPatch,
        },
        cog,
        meta: {
          engine: CE_VERSION,
          route: "top10",
          method: res.method,
          sourceKey: res.sourceKey,
          foundBy: res.foundBy,
          confidence: res.confidence || "high",
          musicSig: sig,
          musicChartKey: "top10",
          allowDerivedTop10: !!norm.allowDerivedTop10,
          top10Completed: !!completion.completed,
          top10CompletionUsed: completion.used || "none",
          top10CompletionYearendKey: completion.yearendSourceKey || "",
          top10CompletionYearendFoundBy: completion.yearendFoundBy || "",
          turnSignals: norm.turnSignals,
          elapsedMs: nowMs() - started,
        },
      };
    }

    if (action === "number1") {
      const res = resolveNumber1ForYear(knowledge, year);
      const sig = buildMusicSig({
        action: "number1",
        year,
        method: res.method || "none",
        sourceKey: res.sourceKey || "none",
        extra: "v1",
      });

      const acts = threeActFollowUps(year);

      const microPack = !!getPinnedMicroMoments(knowledge).pack;
      const momentsLoaded = !!session.musicMomentsLoaded || microPack;
      const momentsLoadedAt = Number(session.musicMomentsLoadedAt || 0) || (microPack ? nowMs() : 0);

      if (!res.ok) {
        const replyRaw = `#1 anchor for ${year} isn’t available yet. Next: run Top 10 for ${year}.`;
        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: [
            { id: "fu_top10", type: "chip", label: `Top 10 for ${year}`, payload: { lane: "music", action: "top10", year } },
            { id: "fu_story", type: "chip", label: "“Okay… now we make it cinematic.”", payload: { lane: "music", action: "story_moment", year } },
          ],
          followUpsStrings: [`Top 10 for ${year}`, `Okay… now we make it cinematic.`],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "number1",
            musicMomentsLoaded: momentsLoaded,
            musicMomentsLoadedAt: momentsLoadedAt,
            ...baseCogPatch,
          },
          cog,
          meta: { engine: CE_VERSION, route: "number1", found: false, reason: res.reason, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      if (shouldDampen(session, sig)) {
        const replyRaw = `#1 anchor for ${year} is already set. Next: story or micro.`;
        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: acts.followUps.slice(1),
          followUpsStrings: acts.followUpsStrings.slice(1),
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "number1",
            musicMomentsLoaded: momentsLoaded,
            musicMomentsLoadedAt: momentsLoadedAt,
            ...baseCogPatch,
          },
          cog,
          meta: { engine: CE_VERSION, route: "number1", dampened: true, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      const replyRaw = formatNumber1(year, res.item);
      return {
        ok: true,
        reply: applyTurnConstitutionToReply(replyRaw, cog),
        lane: "music",
        followUps: acts.followUps.slice(1),
        followUpsStrings: acts.followUpsStrings.slice(1),
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "number1",
          musicMomentsLoaded: momentsLoaded,
          musicMomentsLoadedAt: momentsLoadedAt,
          ...baseCogPatch,
        },
        cog,
        meta: { engine: CE_VERSION, route: "number1", method: res.method, sourceKey: res.sourceKey, foundBy: res.foundBy, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
      };
    }

    if (action === "story_moment") {
      const res = resolveStoryMomentForYear(knowledge, year);
      const sig = buildMusicSig({
        action: "story_moment",
        year,
        method: res.method || "none",
        sourceKey: res.sourceKey || "none",
        extra: "v1",
      });

      const acts = threeActFollowUps(year);

      const microPack = !!getPinnedMicroMoments(knowledge).pack;
      const momentsLoaded = !!session.musicMomentsLoaded || microPack;
      const momentsLoadedAt = Number(session.musicMomentsLoadedAt || 0) || (microPack ? nowMs() : 0);

      if (!res.ok) {
        const replyRaw = `No pinned story moment for ${year}. Pick a mood: romantic, rebellious, or nostalgic.`;
        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: [
            { id: "fu_rom", type: "chip", label: "Romantic", payload: { lane: "music", action: "custom_story", year, vibe: "romantic" } },
            { id: "fu_reb", type: "chip", label: "Rebellious", payload: { lane: "music", action: "custom_story", year, vibe: "rebellious" } },
            { id: "fu_nos", type: "chip", label: "Nostalgic", payload: { lane: "music", action: "custom_story", year, vibe: "nostalgic" } },
          ],
          followUpsStrings: ["Romantic", "Rebellious", "Nostalgic"],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "story",
            musicMomentsLoaded: momentsLoaded,
            musicMomentsLoadedAt: momentsLoadedAt,
            ...baseCogPatch,
          },
          cog,
          meta: { engine: CE_VERSION, route: "story_moment", found: false, reason: res.reason, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      if (shouldDampen(session, sig)) {
        const replyRaw = `Already cinematic for ${year}. Next: micro moment.`;
        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: [acts.followUps[2]],
          followUpsStrings: [acts.followUpsStrings[2]],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "story",
            musicMomentsLoaded: momentsLoaded,
            musicMomentsLoadedAt: momentsLoadedAt,
            ...baseCogPatch,
          },
          cog,
          meta: { engine: CE_VERSION, route: "story_moment", dampened: true, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      const replyRaw = `Okay… now we make it cinematic.\n\n${safeStr(res.text).trim()}`;
      return {
        ok: true,
        reply: applyTurnConstitutionToReply(replyRaw, cog),
        lane: "music",
        followUps: [acts.followUps[2]],
        followUpsStrings: [acts.followUpsStrings[2]],
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "story",
          musicMomentsLoaded: momentsLoaded,
          musicMomentsLoadedAt: momentsLoadedAt,
          ...baseCogPatch,
        },
        cog,
        meta: { engine: CE_VERSION, route: "story_moment", method: res.method, sourceKey: res.sourceKey, foundBy: res.foundBy, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
      };
    }

    if (action === "micro_moment") {
      const res = resolveMicroMomentForYear(knowledge, year);
      const sig = buildMusicSig({
        action: "micro_moment",
        year,
        method: res.method || "none",
        sourceKey: res.sourceKey || "none",
        extra: "v1",
      });

      if (!res.ok) {
        const replyRaw = `No micro moment loaded for ${year}. Next: Top 10 or #1 anchor.`;
        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: [
            { id: "fu_top10", type: "chip", label: `Top 10 for ${year}`, payload: { lane: "music", action: "top10", year } },
            { id: "fu_n1", type: "chip", label: `#1 for ${year}`, payload: { lane: "music", action: "number1", year } },
          ],
          followUpsStrings: [`Top 10 for ${year}`, `#1 for ${year}`],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "micro",
            musicMomentsLoaded: !!session.musicMomentsLoaded,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
            ...baseCogPatch,
          },
          cog,
          meta: { engine: CE_VERSION, route: "micro_moment", found: false, reason: res.reason, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      if (shouldDampen(session, sig)) {
        const replyRaw = `Micro moment for ${year} is already sealed. Next: pick another year or switch lanes.`;
        return {
          ok: true,
          reply: applyTurnConstitutionToReply(replyRaw, cog),
          lane: "music",
          followUps: [
            { id: "fu_newyear", type: "chip", label: "Pick another year", payload: { lane: "music", action: "ask_year" } },
            { id: "fu_general", type: "chip", label: "Switch lanes", payload: { lane: "general", action: "switch_lane" } },
          ],
          followUpsStrings: ["Pick another year", "Switch lanes"],
          sessionPatch: {
            lane: "music",
            lastYear: year,
            lastMusicYear: year,
            __musicLastSig: sig,
            lastMusicChart: prevChart,
            activeMusicChart: "micro",
            musicMomentsLoaded: true,
            musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || nowMs(),
            ...baseCogPatch,
          },
          cog,
          meta: { engine: CE_VERSION, route: "micro_moment", dampened: true, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      const replyRaw = `Tap micro moment—let’s seal the vibe.\n\n${safeStr(res.text).trim()}`;
      return {
        ok: true,
        reply: applyTurnConstitutionToReply(replyRaw, cog),
        lane: "music",
        followUps: [
          { id: "fu_top10", type: "chip", label: `Top 10 for ${year}`, payload: { lane: "music", action: "top10", year } },
          { id: "fu_n1", type: "chip", label: `#1 for ${year}`, payload: { lane: "music", action: "number1", year } },
        ],
        followUpsStrings: [`Top 10 for ${year}`, `#1 for ${year}`],
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          __musicLastSig: sig,
          lastMusicChart: prevChart,
          activeMusicChart: "micro",
          musicMomentsLoaded: true,
          musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || nowMs(),
          ...baseCogPatch,
        },
        cog,
        meta: { engine: CE_VERSION, route: "micro_moment", method: res.method, sourceKey: res.sourceKey, foundBy: res.foundBy, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
      };
    }

    // fallback menu
    if (year) {
      const acts = threeActFollowUps(year);
      const replyRaw = `For ${year}: Top 10, #1 anchor, story moment, micro moment, or Year-End Hot 100.`;
      return {
        ok: true,
        reply: applyTurnConstitutionToReply(replyRaw, cog),
        lane: "music",
        followUps: [
          ...acts.followUps,
          { id: "fu_yearend", type: "chip", label: `Year-End Hot 100 (${year})`, payload: { lane: "music", action: "yearend_hot100", year } },
        ],
        followUpsStrings: [...acts.followUpsStrings, `Year-End Hot 100 (${year})`],
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          activeMusicChart: safeStr(session.activeMusicChart || ""),
          lastMusicChart: safeStr(session.lastMusicChart || ""),
          musicMomentsLoaded: !!session.musicMomentsLoaded,
          musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
          ...baseCogPatch,
        },
        cog,
        meta: { engine: CE_VERSION, route: "music_menu", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
      };
    }

    const replyRaw = `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`;
    return {
      ok: true,
      reply: applyTurnConstitutionToReply(replyRaw, cog),
      lane: "music",
      sessionPatch: { lane: "music", ...baseCogPatch },
      cog,
      meta: { engine: CE_VERSION, route: "music_need_year", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

  // ---------------------------------
  // GENERAL
  // ---------------------------------
  if ((cog.mode === "architect" || cog.mode === "transitional") && cog.intent === "ADVANCE") {
    const replyRaw = `Defaulting to Music. Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}).`;
    return {
      ok: true,
      reply: applyTurnConstitutionToReply(replyRaw, cog),
      lane: "music",
      sessionPatch: { lane: "music", ...baseCogPatch },
      cog,
      meta: { engine: CE_VERSION, route: "general_default_music", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

  const replyRaw = safeStr(norm.text)
    ? `Tell me what you want next: music, movies, or sponsors.`
    : `Okay — tell me what you want next.`;

  return {
    ok: true,
    reply: applyTurnConstitutionToReply(replyRaw, cog),
    lane: lane || "general",
    sessionPatch: { lane: lane || "general", ...baseCogPatch },
    cog,
    meta: { engine: CE_VERSION, route: "general", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
  };
}

module.exports = {
  CE_VERSION,
  handleChat,
  default: handleChat,
};

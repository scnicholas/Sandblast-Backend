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
 * v0.7bE (PAYLOAD BEATS SILENCE++++ + CHIP-CLICK ADVANCE++++):
 * ✅ If payload.action exists, we treat the turn as actionable even if text is empty
 * ✅ If payload.year exists, it is a valid yearSource (prevents “need year” on chip clicks)
 * ✅ Adds meta.turnSignals echo (hasPayload/payloadAction/payloadYear/textEmpty) for quick diagnosis
 * ✅ Keeps: v0.7bD pinned aliases, miss reasons, year-end route, loop dampener, derived guard default OFF, 3-act followUps, session keys
 */

const CE_VERSION =
  "chatEngine v0.7bE (PAYLOAD BEATS SILENCE++++ + CHIP-CLICK ADVANCE++++ + pinned aliases + accurate miss reasons + year-end route + loop dampener)";

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
    turnSignals: {
      hasPayload,
      payloadAction: payloadAction || "",
      payloadYear: payloadYear ?? null,
      textEmpty,
      // useful for diagnosing "chip ignored" reports
      effectiveAction: action || "",
      effectiveYear: year ?? null,
    },
  };
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

  const yearSticky = normYear(session.lastYear) ?? null;

  // PAYLOAD YEAR BEATS STICKY YEAR (chip click should override prior context)
  const year = norm.year ?? yearSticky ?? null;

  const lane =
    safeStr(norm.lane || "").trim() ||
    (norm.action ? "music" : "") ||
    safeStr(session.lane || "").trim() ||
    "general";

  const prevChart = safeStr(session.activeMusicChart || session.lastMusicChart || "").trim();

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
      },
      meta: {
        engine: CE_VERSION,
        resetHint: true,
        turnSignals: norm.turnSignals,
        elapsedMs: nowMs() - started,
      },
    };
  }

  if (norm.action === "ask_year") {
    return {
      ok: true,
      reply: `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}). I’ll start with Top 10 — or you can pick #1, story, or micro.`,
      lane: "music",
      followUps: [
        { id: "fu_1973", type: "chip", label: "1973", payload: { lane: "music", action: "top10", year: 1973 } },
        { id: "fu_1988", type: "chip", label: "1988", payload: { lane: "music", action: "top10", year: 1988 } },
        { id: "fu_1992", type: "chip", label: "1992", payload: { lane: "music", action: "top10", year: 1992 } },
      ],
      followUpsStrings: ["1973", "1988", "1992"],
      sessionPatch: { lane: "music" },
      meta: { engine: CE_VERSION, route: "ask_year", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

  if (norm.action === "switch_lane") {
    return {
      ok: true,
      reply: `Sure. Where to?\n\n• Music\n• Movies\n• Sponsors`,
      lane: "general",
      followUps: [
        { id: "fu_music", type: "chip", label: "Music", payload: { lane: "music" } },
        { id: "fu_movies", type: "chip", label: "Movies", payload: { lane: "movies" } },
        { id: "fu_sponsors", type: "chip", label: "Sponsors", payload: { lane: "sponsors" } },
      ],
      followUpsStrings: ["Music", "Movies", "Sponsors"],
      sessionPatch: { lane: "general" },
      meta: { engine: CE_VERSION, route: "switch_lane", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

  const requiresYear = ["top10", "number1", "story_moment", "micro_moment", "yearend_hot100", "custom_story"];

  // CHIP-CLICK ADVANCE: if action is present via payload, do NOT misfire "need year" unless year truly absent
  if (requiresYear.includes(norm.action) && !year) {
    return {
      ok: true,
      reply: `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}) and I’ll make it sing.`,
      lane: "music",
      followUps: [
        { id: "fu_1973", type: "chip", label: "1973", payload: { lane: "music", action: norm.action || "top10", year: 1973 } },
        { id: "fu_1988", type: "chip", label: "1988", payload: { lane: "music", action: norm.action || "top10", year: 1988 } },
        { id: "fu_1960", type: "chip", label: "1960", payload: { lane: "music", action: norm.action || "top10", year: 1960 } },
      ],
      followUpsStrings: ["1973", "1988", "1960"],
      sessionPatch: { lane: "music" },
      meta: { engine: CE_VERSION, needYear: true, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

  if (year && (year < PUBLIC_MIN_YEAR || year > PUBLIC_MAX_YEAR)) {
    return {
      ok: true,
      reply: `I can do ${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}. Give me a year in that range and I’ll take you there.`,
      lane: "music",
      sessionPatch: { lane: "music" },
      meta: { engine: CE_VERSION, outOfRange: true, year, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

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
        return {
          ok: true,
          reply: `Want to keep that vibe but switch the lens?\n\nPick: #1 anchor, Top 10, or micro moment.`,
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
          },
          meta: { engine: CE_VERSION, route: "custom_story", dampened: true, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      const story = buildCustomStory({ year, vibe: v, number1Item: n1.ok ? n1.item : null });
      return {
        ok: true,
        reply: `Okay… now we make it cinematic.\n\n${story}`,
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
        },
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
        let why = `I can’t see the year-end Hot 100 pack for ${year} right now.`;
        if (res.reason === "missing_pack") why = `I can’t find the wiki year-end Hot 100 by-year pack in knowledge.`;
        if (res.reason === "year_missing_in_pack") why = `I found the year-end pack, but ${year} is missing inside it.`;
        if (res.reason === "empty_items_for_year") why = `I found ${year}, but the rows are empty (bad ingest / cache gap).`;

        const debug =
          res.sourceKey || res.foundBy
            ? `\n\n(Yearend probe: key=${safeStr(res.sourceKey || "n/a")} foundBy=${safeStr(res.foundBy || "n/a")})`
            : "";

        return {
          ok: true,
          reply: `${why}${debug}\n\nWant Top 10 instead (pinned store)?`,
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
          },
          meta: { engine: CE_VERSION, route: "yearend_hot100", found: false, reason: res.reason, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      if (shouldDampen(session, sig)) {
        return {
          ok: true,
          reply: `We just hit that same year-end list for ${year}. Want the pinned Top 10 (cleaner), or the #1 anchor?`,
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
          },
          meta: { engine: CE_VERSION, route: "yearend_hot100", dampened: true, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      // Default to top 20 for this route (gives value without spamming 100 lines)
      return {
        ok: true,
        reply: formatYearendHot100(year, res.items, 20),
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
        },
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

        let why = `I don’t have a clean Top 10 for ${year} loaded yet.`;
        if (res.reason === "missing_pack_no_fallback") {
          why = `I can’t find the pinned Top 10 store in knowledge at all — so I’m refusing to derive from year-end (loop prevention).`;
        } else if (res.reason === "year_missing_in_pack") {
          why = `I can see the Top 10 store, but ${year} is missing inside it (so it’s not “unloaded”… it’s absent).`;
        } else if (res.reason === "empty_items_for_year") {
          why = `I can see ${year} in the Top 10 store, but its items are empty (weak build / cache gap).`;
        } else if (res.reason === "unsupported_pack_shape") {
          why = `I found a Top 10 pack, but its shape isn’t one of the supported store formats yet.`;
        }

        const acts = threeActFollowUps(year);
        const debug =
          res.sourceKey || res.foundBy
            ? `\n\n(Top10 probe: key=${safeStr(res.sourceKey || "n/a")} foundBy=${safeStr(res.foundBy || "n/a")})`
            : "";

        return {
          ok: true,
          reply:
            `${why}\n\n` +
            (n1Line ? `${n1Line}\n\n` : "") +
            `Pick your next move:` +
            debug,
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
          },
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

      const sig = buildMusicSig({
        action: "top10",
        year,
        method: res.method,
        sourceKey: res.sourceKey,
        extra: "v1",
      });

      const acts = threeActFollowUps(year);

      if (shouldDampen(session, sig)) {
        return {
          ok: true,
          reply:
            `We just hit that same chart beat for ${year}. Want me to switch gears?\n\n` +
            `• “Want the #1 anchor next?”\n` +
            `• “Okay… now we make it cinematic.”\n` +
            `• “Tap micro moment—let’s seal the vibe.”`,
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
          },
          meta: {
            engine: CE_VERSION,
            route: "top10",
            dampened: true,
            musicSig: sig,
            musicChartKey: "top10",
            method: res.method,
            sourceKey: res.sourceKey,
            foundBy: res.foundBy,
            turnSignals: norm.turnSignals,
            elapsedMs: nowMs() - started,
          },
        };
      }

      const reply = formatTop10(year, res.items);
      const microPack = !!getPinnedMicroMoments(knowledge).pack;
      const momentsLoaded = !!session.musicMomentsLoaded || microPack;
      const momentsLoadedAt = Number(session.musicMomentsLoadedAt || 0) || (microPack ? nowMs() : 0);

      return {
        ok: true,
        reply,
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
        },
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
        return {
          ok: true,
          reply: `I can’t see a clean #1 anchor for ${year} in the pinned pack yet. Want me to do the Top 10 instead?`,
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
          },
          meta: { engine: CE_VERSION, route: "number1", found: false, reason: res.reason, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      if (shouldDampen(session, sig)) {
        return {
          ok: true,
          reply: `We already pinned the #1 anchor for ${year}. Want it cinematic, or micro?\n\nPick a chip.`,
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
          },
          meta: { engine: CE_VERSION, route: "number1", dampened: true, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      return {
        ok: true,
        reply: formatNumber1(year, res.item),
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
        },
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
        return {
          ok: true,
          reply: `I don’t have a pinned story moment for ${year} yet — but I can still make it cinematic.\n\nPick the mood: romantic, rebellious, or nostalgic.`,
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
          },
          meta: { engine: CE_VERSION, route: "story_moment", found: false, reason: res.reason, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      if (shouldDampen(session, sig)) {
        return {
          ok: true,
          reply: `We already made ${year} cinematic. Want the micro moment to seal it?`,
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
          },
          meta: { engine: CE_VERSION, route: "story_moment", dampened: true, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      return {
        ok: true,
        reply: `Okay… now we make it cinematic.\n\n${safeStr(res.text).trim()}`,
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
        },
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
        return {
          ok: true,
          reply: `I don’t see a micro moment loaded for ${year} yet.\n\nIf you want, hit Top 10 or the #1 anchor — I’ll keep the vibe tight.`,
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
          },
          meta: { engine: CE_VERSION, route: "micro_moment", found: false, reason: res.reason, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      if (shouldDampen(session, sig)) {
        return {
          ok: true,
          reply: `Micro moment for ${year} is already sealed. Want to jump years, or switch lanes?`,
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
          },
          meta: { engine: CE_VERSION, route: "micro_moment", dampened: true, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
        };
      }

      return {
        ok: true,
        reply: `Tap micro moment—let’s seal the vibe.\n\n${safeStr(res.text).trim()}`,
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
        },
        meta: { engine: CE_VERSION, route: "micro_moment", method: res.method, sourceKey: res.sourceKey, foundBy: res.foundBy, musicSig: sig, turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
      };
    }

    // fallback menu
    if (year) {
      const acts = threeActFollowUps(year);
      return {
        ok: true,
        reply: `Tell me what you want for ${year}: Top 10, #1 anchor, story moment, micro moment — or the Year-End Hot 100 list.`,
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
        },
        meta: { engine: CE_VERSION, route: "music_menu", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
      };
    }

    return {
      ok: true,
      reply: `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}) and I’ll start with the Top 10.`,
      lane: "music",
      sessionPatch: { lane: "music" },
      meta: { engine: CE_VERSION, route: "music_need_year", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
    };
  }

  // ---------------------------------
  // GENERAL
  // ---------------------------------
  return {
    ok: true,
    reply: safeStr(norm.text)
      ? `Tell me what you want next — music, movies, or sponsors.`
      : `Okay — tell me what you want next.`,
    lane: lane || "general",
    sessionPatch: { lane: lane || "general" },
    meta: { engine: CE_VERSION, route: "general", turnSignals: norm.turnSignals, elapsedMs: nowMs() - started },
  };
}

module.exports = {
  CE_VERSION,
  handleChat,
  default: handleChat,
};

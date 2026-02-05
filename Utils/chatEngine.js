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
 * v0.7bA (MUSIC LOOP-DAMPENER++++ + SESSION PATCH KEYS++++):
 * ✅ Uses + updates these session continuity keys (index.js now allows them):
 *    - __musicLastSig, activeMusicChart, lastMusicChart, musicMomentsLoaded, musicMomentsLoadedAt
 * ✅ Top10 resolver is PINNED-FIRST and supports your canonical shape:
 *    - {years:{YYYY:{items:[{pos|rank,title,artist}]}}}  (top10_by_year_v1.json)
 *    - year-keyed arrays OR rows arrays fallback supported
 * ✅ HARD-GUARD: disables old "derived_top10_from_yearend" loop by default
 *    - Year-end fallback only if explicitly allowed (allowDerivedTop10=true)
 * ✅ Builds “Guiding Attention in Three Acts” follow-ups as real followUps (and legacy strings)
 */

const CE_VERSION =
  "chatEngine v0.7bA (MUSIC LOOP-DAMPENER++++ + SESSION PATCH KEYS++++ + pinned-first resolvers + derived guard)";

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
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
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
  // small, dependency-free-ish hash (NOT cryptographic)
  // stable enough for loop signatures
  const s = safeStr(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function pick(obj, path, def) {
  try {
    const parts = String(path).split(".");
    let cur = obj;
    for (const p of parts) {
      if (!cur) return def;
      cur = cur[p];
    }
    return cur === undefined ? def : cur;
  } catch (_) {
    return def;
  }
}
function normYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1900 || t > 2100) return null;
  return t;
}
function normalizeSongLine(r) {
  const o = isPlainObject(r) ? r : {};
  const pos = clampInt(o.pos ?? o.rank ?? o.position ?? o["#"] ?? o.no ?? o.number, null, 1, 500);
  const title = safeStr(o.title ?? o.song ?? o.single ?? o.track ?? "").trim();
  const artist = safeStr(o.artist ?? o.artists ?? o.performer ?? "").trim();
  return { pos: pos || null, title, artist };
}
function compactList(items, maxN) {
  const arr = Array.isArray(items) ? items : [];
  return arr.slice(0, maxN);
}
function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function truthy(v) {
  if (v === true) return true;
  const s = safeStr(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

// -------------------------
// config
// -------------------------
const PUBLIC_MIN_YEAR = 1950;
const PUBLIC_MAX_YEAR = 2025;

// -------------------------
// inbound parse / intent
// -------------------------
function normalizeInbound(input) {
  const body = isPlainObject(input) ? input : {};
  const payload = isPlainObject(body.payload) ? body.payload : {};
  const ctx = isPlainObject(body.ctx) ? body.ctx : {};
  const client = isPlainObject(body.client) ? body.client : {};

  const textRaw = safeStr(
    body.text || body.message || body.prompt || body.query || payload.text || payload.message || ""
  ).trim();

  const routeHint = safeStr(body.routeHint || client.routeHint || body.lane || payload.lane || "").trim();
  const source = safeStr(body.source || client.source || "").trim();
  const lane = safeStr(body.lane || payload.lane || ctx.lane || "").trim();

  const year =
    normYear(body.year) ??
    normYear(payload.year) ??
    normYear(ctx.year) ??
    extractYearFromText(textRaw) ??
    null;

  const action =
    safeStr(payload.action || body.action || ctx.action || "").trim() ||
    classifyAction(textRaw, payload, body, ctx) ||
    "";

  const intent = safeStr(payload.intent || body.intent || ctx.intent || payload.mode || body.mode || ctx.mode || "").trim() || "";

  // explicit opt-in for year-end -> derived top10 fallback (off by default to kill loop)
  const allowDerivedTop10 =
    truthy(payload.allowDerivedTop10) ||
    truthy(body.allowDerivedTop10) ||
    truthy(ctx.allowDerivedTop10) ||
    truthy(payload.allowYearendFallback) ||
    truthy(body.allowYearendFallback) ||
    truthy(ctx.allowYearendFallback);

  return {
    body,
    payload,
    ctx,
    client,
    text: textRaw,
    routeHint,
    source,
    lane,
    year,
    action,
    intent,
    allowDerivedTop10,
  };
}

function extractYearFromText(t) {
  const s = safeStr(t).trim();
  if (!s) return null;
  const m = s.match(/\b(19[5-9]\d|20[0-2]\d|2025)\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return normYear(y);
}

function classifyAction(text, payload) {
  const t = safeStr(text).toLowerCase();

  // explicit payload wins
  const pA = safeStr(payload.action || "").trim();
  if (pA) return pA;

  // music actions
  if (/\b(top\s*10|top ten)\b/.test(t)) return "top10";
  if (/\b(#\s*1|number\s*1|number one|no\.\s*1)\b/.test(t)) return "number1";
  if (/\b(story\s*moment|make it cinematic|cinematic)\b/.test(t)) return "story_moment";
  if (/\b(micro\s*moment|tap micro|seal the vibe)\b/.test(t)) return "micro_moment";
  if (/\b(year[-\s]*end|year end|yearend)\b/.test(t) && /\bhot\s*100\b/.test(t)) return "yearend_hot100";

  // reset-like (index.js handles reset, but we keep a lightweight hook for engine-only tests)
  if (t === "__cmd:reset__" || /\b(reset|start over|clear session)\b/.test(t)) return "reset";

  return "";
}

// -------------------------
// knowledge accessors
// -------------------------
function getPack(knowledge, key) {
  const k = isPlainObject(knowledge) ? knowledge : {};
  const json = isPlainObject(k.json) ? k.json : {};
  return json[key];
}

function getPinnedTop10(knowledge) {
  return getPack(knowledge, "music/top10_by_year");
}
function getPinnedNumber1(knowledge) {
  return getPack(knowledge, "music/number1_by_year");
}
function getPinnedStoryMoments(knowledge) {
  return getPack(knowledge, "music/story_moments_by_year");
}
function getPinnedMicroMoments(knowledge) {
  return getPack(knowledge, "music/micro_moments_by_year");
}
function getWikiYearendByYear(knowledge) {
  // derived outKey from index manifest
  return getPack(knowledge, "music/wiki/yearend_hot100_by_year");
}

// -------------------------
// resolvers
// -------------------------
function resolveTop10ForYear(knowledge, year, opts) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const allowDerivedTop10 = !!(opts && opts.allowDerivedTop10);

  // PINNED FIRST
  const top10 = getPinnedTop10(knowledge);
  if (top10) {
    // canonical: { years: { "1960": { items:[...] } } }
    if (isPlainObject(top10.years) && isPlainObject(top10.years[String(y)])) {
      const block = top10.years[String(y)];
      const items = asArray(block.items).map(normalizeSongLine).filter((r) => r.title || r.artist);
      if (items.length) {
        return { ok: true, method: "pinned_top10_years_items", sourceKey: "music/top10_by_year", year: y, items };
      }
    }

    // year-keyed array: { "1960": [ ... ] }
    if (isPlainObject(top10) && Array.isArray(top10[String(y)])) {
      const items = top10[String(y)].map(normalizeSongLine).filter((r) => r.title || r.artist);
      if (items.length) {
        return { ok: true, method: "pinned_top10_year_keyed_array", sourceKey: "music/top10_by_year", year: y, items };
      }
    }

    // rows array (less common)
    if (Array.isArray(top10.rows)) {
      const rows = top10.rows.filter((r) => Number(r?.year) === y);
      const items = rows.map(normalizeSongLine).filter((r) => r.title || r.artist);
      if (items.length) {
        return { ok: true, method: "pinned_top10_rows", sourceKey: "music/top10_by_year", year: y, items };
      }
    }
  }

  // HARD GUARD: year-end fallback disabled unless explicitly allowed
  if (!allowDerivedTop10) {
    return { ok: false, reason: "pinned_missing_no_fallback" };
  }

  // FALLBACK ONLY if explicitly allowed
  const wiki = getWikiYearendByYear(knowledge);
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
        sourceKey: "music/wiki/yearend_hot100_by_year",
        year: y,
        items: sorted,
        confidence: "medium",
      };
    }
  }

  return { ok: false, reason: "not_found" };
}

function resolveNumber1ForYear(knowledge, year) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const p = getPinnedNumber1(knowledge);
  if (!p) return { ok: false, reason: "missing_pack" };

  if (Array.isArray(p.rows)) {
    const hit = p.rows.find((r) => Number(r?.year) === y);
    if (hit) {
      const o = normalizeSongLine(hit);
      return { ok: true, method: "pinned_rows", sourceKey: "music/number1_by_year", year: y, item: o };
    }
  }

  if (isPlainObject(p.byYear) && (isPlainObject(p.byYear[String(y)]) || Array.isArray(p.byYear[String(y)]))) {
    const v = p.byYear[String(y)];
    const hit = Array.isArray(v) ? v[0] : v;
    const o = normalizeSongLine(hit);
    return { ok: true, method: "pinned_byYear", sourceKey: "music/number1_by_year", year: y, item: o };
  }

  if (isPlainObject(p[String(y)]) || Array.isArray(p[String(y)])) {
    const v = p[String(y)];
    const hit = Array.isArray(v) ? v[0] : v;
    const o = normalizeSongLine(hit);
    return { ok: true, method: "pinned_year_key", sourceKey: "music/number1_by_year", year: y, item: o };
  }

  return { ok: false, reason: "not_found" };
}

function resolveStoryMomentForYear(knowledge, year) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const p = getPinnedStoryMoments(knowledge);
  if (!p) return { ok: false, reason: "missing_pack" };

  const getText = (r) => safeStr(r?.text || r?.moment || r?.story || r?.copy || r?.line || "").trim();

  if (Array.isArray(p.rows)) {
    const hit = p.rows.find((r) => Number(r?.year) === y);
    const txt = hit ? getText(hit) : "";
    if (txt) return { ok: true, method: "pinned_rows", sourceKey: "music/story_moments_by_year", year: y, text: txt };
  }

  if (isPlainObject(p.byYear) && p.byYear[String(y)]) {
    const v = p.byYear[String(y)];
    const txt = getText(v);
    if (txt) return { ok: true, method: "pinned_byYear", sourceKey: "music/story_moments_by_year", year: y, text: txt };
  }

  if (p[String(y)]) {
    const v = p[String(y)];
    const hit = Array.isArray(v) ? v[0] : v;
    const txt = getText(hit);
    if (txt) return { ok: true, method: "pinned_year_key", sourceKey: "music/story_moments_by_year", year: y, text: txt };
  }

  return { ok: false, reason: "not_found" };
}

function resolveMicroMomentForYear(knowledge, year) {
  const y = normYear(year);
  if (!y) return { ok: false, reason: "missing_year" };

  const p = getPinnedMicroMoments(knowledge);
  if (!p) return { ok: false, reason: "missing_pack" };

  const getText = (r) => safeStr(r?.text || r?.moment || r?.micro || r?.copy || r?.line || "").trim();

  if (Array.isArray(p.rows)) {
    const hit = p.rows.find((r) => Number(r?.year) === y);
    const txt = hit ? getText(hit) : "";
    if (txt) return { ok: true, method: "pinned_rows", sourceKey: "music/micro_moments_by_year", year: y, text: txt };
  }

  if (isPlainObject(p.byYear) && p.byYear[String(y)]) {
    const v = p.byYear[String(y)];
    const txt = getText(v);
    if (txt) return { ok: true, method: "pinned_byYear", sourceKey: "music/micro_moments_by_year", year: y, text: txt };
  }

  if (p[String(y)]) {
    const v = p[String(y)];
    const hit = Array.isArray(v) ? v[0] : v;
    const txt = getText(hit);
    if (txt) return { ok: true, method: "pinned_year_key", sourceKey: "music/micro_moments_by_year", year: y, text: txt };
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

  const fu = [
    {
      id: "fu_number1",
      type: "chip",
      label: "“Want the #1 anchor next?”",
      payload: { lane: "music", action: "number1", year: y || undefined, route: "number1" },
    },
    {
      id: "fu_story",
      type: "chip",
      label: "“Okay… now we make it cinematic.”",
      payload: { lane: "music", action: "story_moment", year: y || undefined, route: "story_moment" },
    },
    {
      id: "fu_micro",
      type: "chip",
      label: "“Tap micro moment—let’s seal the vibe.”",
      payload: { lane: "music", action: "micro_moment", year: y || undefined, route: "micro_moment" },
    },
  ];

  const fus = [
    `Want the #1 anchor next for ${yLabel}?`,
    `Okay… now we make it cinematic.`,
    `Tap micro moment—let’s seal the vibe.`,
  ];

  return { followUps: fu, followUpsStrings: fus };
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

function formatNumber1(year, item) {
  const y = normYear(year);
  const title = safeStr(item?.title || "").trim();
  const artist = safeStr(item?.artist || "").trim();
  if (!title && !artist)
    return y ? `#1 — ${y}\n\nI don’t have a clean #1 anchor for this year yet.` : `I don’t have a clean #1 anchor yet.`;
  return `#1 — ${y}\n\n“${title || "(title unknown)"}” — ${artist || "(artist unknown)"}`;
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
  const year = norm.year ?? yearSticky ?? null;

  // lane inference
  const lane = safeStr(norm.lane || "").trim() || (norm.action ? "music" : "") || safeStr(session.lane || "").trim() || "general";

  // prior chart key (for continuity)
  const prevChart = safeStr(session.activeMusicChart || session.lastMusicChart || "").trim();

  // quick reset hook (mostly for local tests; index.js now does the true reset)
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
      meta: { engine: CE_VERSION, resetHint: true, elapsedMs: nowMs() - started },
    };
  }

  // year guard for music actions that require year
  const requiresYear = ["top10", "number1", "story_moment", "micro_moment", "yearend_hot100"];
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
      meta: { engine: CE_VERSION, needYear: true, elapsedMs: nowMs() - started },
    };
  }

  // range guard
  if (year && (year < PUBLIC_MIN_YEAR || year > PUBLIC_MAX_YEAR)) {
    return {
      ok: true,
      reply: `I can do ${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}. Give me a year in that range and I’ll take you there.`,
      lane: "music",
      sessionPatch: { lane: "music" },
      meta: { engine: CE_VERSION, outOfRange: true, year, elapsedMs: nowMs() - started },
    };
  }

  // default action if lane/music and year present
  const action = norm.action || (lane === "music" && year ? "top10" : "");

  // ---------------------------------
  // MUSIC
  // ---------------------------------
  if (lane === "music" || action) {
    // top10
    if (action === "top10") {
      const res = resolveTop10ForYear(knowledge, year, { allowDerivedTop10: norm.allowDerivedTop10 });

      if (!res.ok) {
        const why =
          res.reason === "pinned_missing_no_fallback"
            ? `I don’t have a pinned Top 10 for ${year} loaded yet — and I’m deliberately not deriving it from year-end data (that’s the loop you told me to kill).`
            : `I don’t have a clean Top 10 for ${year} loaded yet.`;

        const acts = threeActFollowUps(year);

        return {
          ok: true,
          reply: `${why}\n\nIf you want, ask for the #1 anchor instead — and I’ll still make it feel like a moment.`,
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
          meta: { engine: CE_VERSION, route: "top10", found: false, reason: res.reason, allowDerivedTop10: !!norm.allowDerivedTop10, elapsedMs: nowMs() - started },
        };
      }

      const sig = buildMusicSig({
        action: "top10",
        year,
        method: res.method,
        sourceKey: res.sourceKey,
        extra: "v1",
      });

      // loop dampener: same sig twice => shift forward (ask for #1 / story / micro)
      if (shouldDampen(session, sig)) {
        const reply =
          `We just hit that same chart beat for ${year}. Want me to switch gears?\n\n` +
          `• “Want the #1 anchor next?”\n` +
          `• “Okay… now we make it cinematic.”\n` +
          `• “Tap micro moment—let’s seal the vibe.”`;

        const acts = threeActFollowUps(year);

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
            elapsedMs: nowMs() - started,
          },
        };
      }

      const reply = formatTop10(year, res.items);
      const acts = threeActFollowUps(year);
      const microPack = !!getPinnedMicroMoments(knowledge);
      const momentsLoaded = !!session.musicMomentsLoaded || microPack;
      const momentsLoadedAt =
        Number(session.musicMomentsLoadedAt || 0) || (microPack ? nowMs() : 0);

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
          confidence: res.confidence || "high",
          musicSig: sig,
          musicChartKey: "top10",
          allowDerivedTop10: !!norm.allowDerivedTop10,
          elapsedMs: nowMs() - started,
        },
      };
    }

    // number1
    if (action === "number1") {
      const res = resolveNumber1ForYear(knowledge, year);

      const sig = buildMusicSig({
        action: "number1",
        year,
        method: res.method || "none",
        sourceKey: res.sourceKey || "none",
        extra: "v1",
      });

      const microPack = !!getPinnedMicroMoments(knowledge);
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
          meta: { engine: CE_VERSION, route: "number1", found: false, reason: res.reason, musicSig: sig, musicChartKey: "number1", elapsedMs: nowMs() - started },
        };
      }

      const reply = formatNumber1(year, res.item);
      const acts = threeActFollowUps(year);

      // dampen if repeated
      if (shouldDampen(session, sig)) {
        return {
          ok: true,
          reply: `We already pinned the #1 anchor for ${year}. Want it cinematic, or micro?\n\nPick a chip.`,
          lane: "music",
          followUps: acts.followUps.slice(1), // story + micro
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
          meta: { engine: CE_VERSION, route: "number1", dampened: true, musicSig: sig, musicChartKey: "number1", elapsedMs: nowMs() - started },
        };
      }

      return {
        ok: true,
        reply,
        lane: "music",
        followUps: acts.followUps.slice(1), // after #1, push story+micro
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
        meta: { engine: CE_VERSION, route: "number1", method: res.method, sourceKey: res.sourceKey, musicSig: sig, musicChartKey: "number1", elapsedMs: nowMs() - started },
      };
    }

    // story moment
    if (action === "story_moment") {
      const res = resolveStoryMomentForYear(knowledge, year);

      const sig = buildMusicSig({
        action: "story_moment",
        year,
        method: res.method || "none",
        sourceKey: res.sourceKey || "none",
        extra: "v1",
      });

      const microPack = !!getPinnedMicroMoments(knowledge);
      const momentsLoaded = !!session.musicMomentsLoaded || microPack;
      const momentsLoadedAt = Number(session.musicMomentsLoadedAt || 0) || (microPack ? nowMs() : 0);

      if (!res.ok) {
        return {
          ok: true,
          reply:
            `I don’t have a story moment loaded for ${year} yet — but I can still build one if you tell me the mood.\n\n` +
            `Want it: romantic, rebellious, or nostalgic?`,
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
          meta: { engine: CE_VERSION, route: "story_moment", found: false, reason: res.reason, musicSig: sig, musicChartKey: "story", elapsedMs: nowMs() - started },
        };
      }

      // dampen repeated story moment calls
      if (shouldDampen(session, sig)) {
        const acts = threeActFollowUps(year);
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
          meta: { engine: CE_VERSION, route: "story_moment", dampened: true, musicSig: sig, musicChartKey: "story", elapsedMs: nowMs() - started },
        };
      }

      const reply = `Okay… now we make it cinematic.\n\n${safeStr(res.text).trim()}`;
      const acts = threeActFollowUps(year);

      return {
        ok: true,
        reply,
        lane: "music",
        followUps: [acts.followUps[2]], // micro moment next
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
        meta: { engine: CE_VERSION, route: "story_moment", method: res.method, sourceKey: res.sourceKey, musicSig: sig, musicChartKey: "story", elapsedMs: nowMs() - started },
      };
    }

    // micro moment
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
          reply:
            `I don’t see a micro moment loaded for ${year} yet.\n\n` +
            `If you want, ask for Top 10 or the #1 anchor — and I’ll still keep the vibe tight.`,
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
          meta: { engine: CE_VERSION, route: "micro_moment", found: false, reason: res.reason, musicSig: sig, musicChartKey: "micro", elapsedMs: nowMs() - started },
        };
      }

      if (shouldDampen(session, sig)) {
        return {
          ok: true,
          reply: `Micro moment for ${year} is already sealed. Want to jump years, or do another lane?`,
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
          meta: { engine: CE_VERSION, route: "micro_moment", dampened: true, musicSig: sig, musicChartKey: "micro", elapsedMs: nowMs() - started },
        };
      }

      const reply = `Tap micro moment—let’s seal the vibe.\n\n${safeStr(res.text).trim()}`;

      return {
        ok: true,
        reply,
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
        meta: { engine: CE_VERSION, route: "micro_moment", method: res.method, sourceKey: res.sourceKey, musicSig: sig, musicChartKey: "micro", elapsedMs: nowMs() - started },
      };
    }

    // fallback music response
    if (year) {
      const acts = threeActFollowUps(year);
      return {
        ok: true,
        reply: `Tell me what you want for ${year}: Top 10, #1 anchor, story moment, or micro moment.`,
        lane: "music",
        followUps: acts.followUps,
        followUpsStrings: acts.followUpsStrings,
        sessionPatch: {
          lane: "music",
          lastYear: year,
          lastMusicYear: year,
          activeMusicChart: safeStr(session.activeMusicChart || ""),
          lastMusicChart: safeStr(session.lastMusicChart || ""),
          musicMomentsLoaded: !!session.musicMomentsLoaded,
          musicMomentsLoadedAt: Number(session.musicMomentsLoadedAt || 0) || 0,
        },
        meta: { engine: CE_VERSION, route: "music_menu", elapsedMs: nowMs() - started },
      };
    }

    return {
      ok: true,
      reply: `Give me a year (${PUBLIC_MIN_YEAR}–${PUBLIC_MAX_YEAR}) and I’ll start with the Top 10.`,
      lane: "music",
      sessionPatch: { lane: "music" },
      meta: { engine: CE_VERSION, route: "music_need_year", elapsedMs: nowMs() - started },
    };
  }

  // ---------------------------------
  // GENERAL
  // ---------------------------------
  return {
    ok: true,
    reply: safeStr(norm.text) ? `Tell me what you want next — music, movies, or sponsors.` : `Okay — tell me what you want next.`,
    lane: lane || "general",
    sessionPatch: { lane: lane || "general" },
    meta: { engine: CE_VERSION, route: "general", elapsedMs: nowMs() - started },
  };
}

module.exports = {
  CE_VERSION,
  handleChat,
  // also export as function for compatibility
  default: handleChat,
};

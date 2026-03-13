"use strict";

/**
 * musicResolver.js
 * Policy-first music fulfillment resolver
 * - executes compact music requests without generic clarification
 * - preserves year lock and mode carry-forward
 * - returns bounded follow-ups and sessionPatch only
 */

const RESOLVER_VERSION = "musicResolver v1.1.0";
const YEAR_MIN = 1940;
const YEAR_MAX = 2029;

function safeStr(v){ return v == null ? "" : String(v); }
function lower(v){ return safeStr(v).trim().toLowerCase(); }
function isObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v){ return Array.isArray(v) ? v : []; }
function normYear(v){
  const m = typeof v === "number" ? String(v) : safeStr(v).match(/\b(19[4-9]\d|20[0-2]\d)\b/);
  const y = typeof v === "number" ? v : (m ? Number(m[1]) : NaN);
  return Number.isFinite(y) && y >= YEAR_MIN && y <= YEAR_MAX ? Math.trunc(y) : null;
}
function uniqFollowUps(items){
  const seen = new Set();
  const out = [];
  for (const item of arr(items)) {
    const label = safeStr(item?.label || item?.text).trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: safeStr(item?.id || key.replace(/\s+/g, "_")), type: safeStr(item?.type || "action") || "action", label, payload: isObj(item?.payload) ? item.payload : { action: label } });
    if (out.length >= 8) break;
  }
  return out;
}

function resolveAction(ctx){
  if (ctx.policy?.action) return safeStr(ctx.policy.action);
  const t = ctx.textLower;
  if (/\btop\s*10\b|\btop\s*ten\b/.test(t)) return "music_top10_by_year";
  if (/\b#1\b|\bnumber one\b/.test(t)) return "music_number_one_by_year";
  if (/story moment/.test(t)) return "music_story_moment_by_year";
  if (/micro moment/.test(t)) return "music_micro_moment_by_year";
  if (ctx.activeLane === "music" && ctx.year) return "music_top10_by_year";
  return null;
}

function makeContext(input = {}){
  const text = safeStr(input.text || input.message || "");
  const session = isObj(input.session) ? input.session : {};
  const policy = isObj(input.policy) ? input.policy : {};
  const inferred = isObj(input.inferredSlots) ? input.inferredSlots : {};
  const year = normYear(inferred.year) || normYear(policy?.inferredSlots?.year) || normYear(session.lockedYear) || normYear(text);
  const activeLane = safeStr(input.activeLane || session.activeLane || session.lane || "general") || "general";
  return { text, textLower: lower(text), session, policy, inferred, year, activeLane, sourceData: isObj(input.sourceData) ? input.sourceData : {} };
}

function buildFollowUps(year){
  const prev = year && year - 1 >= YEAR_MIN ? { id: `year_${year-1}`, type: "action", label: String(year - 1), payload: { lane: "music", year: year - 1, action: "top10" } } : null;
  const next = year && year + 1 <= YEAR_MAX ? { id: `year_${year+1}`, type: "action", label: String(year + 1), payload: { lane: "music", year: year + 1, action: "top10" } } : null;
  return uniqFollowUps([
    { id: "top10", type: "action", label: "Top 10", payload: { lane: "music", action: "top10" } },
    { id: "number1", type: "action", label: "#1 Song", payload: { lane: "music", action: "number_one" } },
    { id: "story", type: "action", label: "Story moment", payload: { lane: "music", action: "story_moment" } },
    { id: "micro", type: "action", label: "Micro moment", payload: { lane: "music", action: "micro_moment" } },
    prev,
    next,
    { id: "another_year", type: "action", label: "Another year", payload: { lane: "music", action: "year_pick" } }
  ]);
}

function fallbackTop10(year){
  return Array.from({ length: 10 }).map((_, i) => ({ title: `Song ${i+1} (${year})`, artist: `Artist ${i+1}` }));
}
function sourceTop10(year, sourceData){
  const list = sourceData?.top10ByYear?.[year];
  return Array.isArray(list) && list.length ? list.slice(0,10).map(x => typeof x === "string" ? ({ title: x, artist: "Unknown Artist" }) : ({ title: safeStr(x?.title || "Untitled"), artist: safeStr(x?.artist || "Unknown Artist") })) : fallbackTop10(year);
}
function sourceNumberOne(year, sourceData){
  const item = sourceData?.numberOneByYear?.[year];
  if (item) return typeof item === "string" ? { title: item, artist: "Unknown Artist" } : { title: safeStr(item?.title || "Untitled"), artist: safeStr(item?.artist || "Unknown Artist"), note: safeStr(item?.note || "") };
  return { ...sourceTop10(year, sourceData)[0], note: "Replace with your canonical chart source when ready." };
}
function sourceStory(year, sourceData){
  const item = sourceData?.storyMomentByYear?.[year];
  return item && isObj(item) ? { headline: safeStr(item.headline || `Music snapshot for ${year}`), body: safeStr(item.body || "") } : { headline: `Music snapshot for ${year}`, body: "That year carried a distinct chart identity and radio mood. Swap in your sourced Sandblast story moment here." };
}
function sourceMicro(year, sourceData){
  const item = sourceData?.microMomentByYear?.[year];
  return item && isObj(item) ? { body: safeStr(item.body || "") } : { body: `Micro moment for ${year}: strong radio repetition, clear era mood, and an instantly recognizable chart fingerprint.` };
}

function finalize(payload){
  return {
    ok: payload.ok !== false,
    source: "musicResolver",
    version: RESOLVER_VERSION,
    lane: "music",
    action: payload.action || null,
    reply: safeStr(payload.reply || "").trim(),
    followUps: uniqFollowUps(payload.followUps),
    directives: Array.isArray(payload.directives) ? payload.directives.slice(0, 8) : [],
    sessionPatch: isObj(payload.sessionPatch) ? payload.sessionPatch : {},
    meta: isObj(payload.meta) ? payload.meta : {},
    year: payload.year || null
  };
}

async function resolveMusicIntent(input = {}){
  const ctx = makeContext(input);
  const action = resolveAction(ctx);
  const year = ctx.year;
  if (!action) {
    return finalize({
      action: null,
      reply: "Give me the music target and year and I will run it.",
      followUps: buildFollowUps(year),
      sessionPatch: { activeLane: "music", lane: "music" },
      meta: { resolverMode: "clarify" },
      year
    });
  }
  if (!year) {
    return finalize({
      action,
      reply: "Give me the year and I will run it.",
      followUps: buildFollowUps(null),
      sessionPatch: { activeLane: "music", lane: "music" },
      meta: { resolverMode: "clarify_missing_year" }
    });
  }

  if (action === "music_top10_by_year") {
    const items = sourceTop10(year, ctx.sourceData);
    return finalize({
      action,
      reply: [`Here is your Top 10 for ${year}.`, ...items.map((x, i) => `${i+1}. ${x.title} — ${x.artist}`)].join("\n"),
      followUps: buildFollowUps(year),
      sessionPatch: { activeLane: "music", lane: "music", lockedYear: year, activeMusicMode: "top10" },
      meta: { resolverMode: "top10" },
      year
    });
  }
  if (action === "music_number_one_by_year") {
    const item = sourceNumberOne(year, ctx.sourceData);
    return finalize({
      action,
      reply: `The #1 song for ${year} is ${item.title} — ${item.artist}.${item.note ? ` ${item.note}` : ""}`.trim(),
      followUps: buildFollowUps(year),
      sessionPatch: { activeLane: "music", lane: "music", lockedYear: year, activeMusicMode: "numberOne" },
      meta: { resolverMode: "numberOne" },
      year
    });
  }
  if (action === "music_story_moment_by_year") {
    const item = sourceStory(year, ctx.sourceData);
    return finalize({
      action,
      reply: `Story moment for ${year}: ${item.headline}. ${item.body}`.trim(),
      followUps: buildFollowUps(year),
      sessionPatch: { activeLane: "music", lane: "music", lockedYear: year, activeMusicMode: "storyMoment" },
      meta: { resolverMode: "storyMoment" },
      year
    });
  }
  if (action === "music_micro_moment_by_year") {
    const item = sourceMicro(year, ctx.sourceData);
    return finalize({
      action,
      reply: `Micro moment for ${year}: ${item.body}`.trim(),
      followUps: buildFollowUps(year),
      sessionPatch: { activeLane: "music", lane: "music", lockedYear: year, activeMusicMode: "microMoment" },
      meta: { resolverMode: "microMoment" },
      year
    });
  }
  return finalize({
    action: null,
    reply: "Give me the music target and year and I will run it.",
    followUps: buildFollowUps(year),
    sessionPatch: { activeLane: "music", lane: "music" },
    meta: { resolverMode: "clarify_fallback" },
    year
  });
}

module.exports = { RESOLVER_VERSION, resolveMusicIntent };

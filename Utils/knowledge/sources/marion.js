"use strict";

/**
 * Marion Knowledge Adapter (pluggable)
 *
 * Provide opts.marionQuery:
 *   opts.marionQuery = async ({ text, routing, memory, dataset, domains }) => ({ ok:true, items:[...], answer:"...", citations:[...] })
 *
 * If absent, tries require("../../marionSO") and calls .query(payload) if present.
 */

function safeStr(x){ return x == null ? "" : String(x); }
function isPlainObject(x){
  return !!x && typeof x === "object" && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}

let MarionSO = null;
function _requireMarion() {
  if (MarionSO) return MarionSO;
  try { MarionSO = require("../../marionSO"); } catch (e) { MarionSO = null; }
  return MarionSO;
}

async function queryMarion(text, routing, packs, opts) {
  const q = safeStr(text).trim();
  if (!q) return { ok: true, type: "marion", items: [], best: null };

  const o = isPlainObject(opts) ? opts : {};
  const fn = typeof o.marionQuery === "function" ? o.marionQuery : null;
  const M = _requireMarion();

  const payload = {
    text: q,
    routing: isPlainObject(routing) ? routing : {},
    memory: isPlainObject(packs) ? (packs.memory || null) : null,
    dataset: isPlainObject(packs) ? (packs.dataset || null) : null,
    domains: isPlainObject(packs) ? (packs.domains || null) : null,
  };

  try {
    if (fn) return normalize(await fn(payload));
    if (M && typeof M.query === "function") return normalize(await M.query(payload));
  } catch (_e) {}

  return { ok: true, type: "marion", items: [], best: null, note: "marionQuery not configured" };
}

function normalize(res) {
  const r = isPlainObject(res) ? res : {};
  const items = Array.isArray(r.items) ? r.items : [];
  const citations = Array.isArray(r.citations) ? r.citations : [];
  const answer = safeStr(r.answer || r.text || r.reply || "");
  let best = null;
  for (const it of items) {
    const s = Number(it.score || 0) || 0;
    if (!best || s > (Number(best.score || 0) || 0)) best = it;
  }
  if (!best && answer) best = { kind: "answer", text: answer, score: 0.5 };
  return { ok: true, type: "marion", items, citations, answer, best };
}

module.exports = { queryMarion };

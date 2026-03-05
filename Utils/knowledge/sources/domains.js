"use strict";

/**
 * Domain Source Adapter (Six Domains)
 *
 * Provide opts.domainQuery:
 *   opts.domainQuery = async ({ domain, text, k }) => ({ ok:true, items:[...], answer:"..." })
 */

function safeStr(x){ return x == null ? "" : String(x); }
function isPlainObject(x){
  return !!x && typeof x === "object" && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}

async function queryDomains(text, routing, opts) {
  const q = safeStr(text).trim();
  if (!q) return { ok: true, type: "domain", items: [], best: null };

  const r = isPlainObject(routing) ? routing : {};
  const primary = safeStr(r.primary).trim();
  const secondary = Array.isArray(r.secondary) ? r.secondary.map(safeStr).filter(Boolean) : [];
  const domains = [primary, ...secondary].filter(Boolean).slice(0, 3);

  const o = isPlainObject(opts) ? opts : {};
  const fn = typeof o.domainQuery === "function" ? o.domainQuery : null;
  const k = Number.isFinite(o.k) ? o.k : 4;

  if (!fn || !domains.length) {
    return { ok: true, type: "domain", domains, items: [], best: null, note: "domainQuery not configured" };
  }

  const items = [];
  for (const d of domains) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fn({ domain: d, text: q, k });
      if (res && res.ok) {
        const arr = Array.isArray(res.items) ? res.items : [];
        for (const it of arr.slice(0, k)) items.push({ ...it, domain: d, sourceType: "domain" });
        if (res.answer) items.push({ domain: d, sourceType: "domain", kind: "answer", text: safeStr(res.answer) });
      }
    } catch (_e) {}
  }

  let best = null;
  for (const it of items) {
    const s = Number(it.score || 0) || 0;
    if (!best || s > (Number(best.score || 0) || 0)) best = it;
  }

  return { ok: true, type: "domain", domains, items, best };
}

module.exports = { queryDomains };

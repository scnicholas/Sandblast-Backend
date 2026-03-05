"use strict";

/**
 * Domain Routing Policy (Six Domains)
 * Choose 1 primary domain, up to 2 secondary.
 * Update DEFAULT_DOMAINS to match your real six domain labels.
 */

const DEFAULT_DOMAINS = Object.freeze([
  "psychology",
  "law",
  "english",
  "finance",
  "ai",
  "marketing",
]);

function safeStr(x){ return x == null ? "" : String(x); }

function detectDomain(text, hint) {
  const t = safeStr(text).toLowerCase();
  const h = safeStr(hint).toLowerCase();

  if (h && DEFAULT_DOMAINS.includes(h)) return { primary: h, secondary: [] };

  const hits = [];
  const add = (d, kws) => { if (kws.some(k => t.includes(k))) hits.push(d); };

  add("psychology", ["anxiety", "depressed", "stress", "relationship", "feel", "emotion", "trauma"]);
  add("law", ["legal", "contract", "sue", "court", "cra", "rights", "policy"]);
  add("finance", ["income", "refund", "budget", "roi", "cashflow", "tax", "grant"]);
  add("ai", ["model", "llm", "dataset", "rag", "training", "gpu", "vllm", "tgi"]);
  add("marketing", ["ads", "adsense", "campaign", "seo", "conversion", "funnel"]);
  add("english", ["rewrite", "grammar", "tone", "email", "copy", "wording"]);

  const uniq = Array.from(new Set(hits));
  const primary = uniq[0] || "";
  const secondary = uniq.slice(1, 3);

  return { primary, secondary };
}

module.exports = { DEFAULT_DOMAINS, detectDomain };

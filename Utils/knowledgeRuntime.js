"use strict";

/**
 * utils/knowledgeRuntime.js
 *
 * PURPOSE
 * - Normalize knowledge signals into a stable shape for index -> chatEngine -> Marion
 * - Prevent empty or malformed knowledge packets from collapsing the route
 * - Preserve domain-grouped evidence while remaining fail-open safe
 */

const VERSION = "knowledgeRuntime v1.0.0 STABLE-SECTIONS";
const DOMAINS = ["psychology", "law", "finance", "english", "cybersecurity", "ai", "strategy", "marketing", "general"];
const KEYWORD_MAP = {
  psychology: /(anxious|anxiety|panic|overwhelmed|sad|lonely|hurt|grief|depress|afraid|scared|emotion|emotional|support)/i,
  law: /(law|legal|contract|liability|terms|compliance|policy|rights|risk exposure)/i,
  finance: /(finance|financial|revenue|pricing|cash|profit|margin|loan|investor|budget|cost|sales)/i,
  english: /(grammar|rewrite|writing|tone|wording|copy|english|rhetoric|sentence|draft)/i,
  cybersecurity: /(cyber|security|breach|attack|malware|vulnerability|auth|token|incident|exploit)/i,
  ai: /(ai|model|prompt|inference|embedding|llm|agent|reasoning|alignment)/i,
  strategy: /(strategy|roadmap|plan|architecture|system|rollout|operate|execution|scale)/i,
  marketing: /(marketing|brand|audience|campaign|social|positioning|growth|conversion)/i
};

function safeStr(v) { return v == null ? "" : String(v); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function oneLine(v) { return safeStr(v).replace(/\s+/g, " ").trim(); }
function clamp01(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}
function uniqBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr(items)) {
    const key = safeStr(keyFn(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function canonicalDomain(v) {
  const raw = oneLine(v).toLowerCase();
  if (!raw) return "general";
  if (["psych", "psychology"].includes(raw)) return "psychology";
  if (["legal", "law"].includes(raw)) return "law";
  if (["finance", "financial"].includes(raw)) return "finance";
  if (["english", "writing"].includes(raw)) return "english";
  if (["cyber", "cybersecurity", "security"].includes(raw)) return "cybersecurity";
  if (["ai", "artificial intelligence"].includes(raw)) return "ai";
  if (["strategy", "architecture"].includes(raw)) return "strategy";
  if (["marketing", "brand"].includes(raw)) return "marketing";
  return DOMAINS.includes(raw) ? raw : "general";
}
function normalizeItem(item, domain, source = "knowledge.runtime") {
  if (typeof item === "string") {
    const content = oneLine(item);
    if (!content) return null;
    return {
      title: `${domain}_knowledge`,
      content,
      summary: content.slice(0, 220),
      source,
      domain,
      score: 0.72,
      confidence: 0.72,
      tags: [domain, "knowledge"]
    };
  }
  const src = isObj(item) ? item : {};
  const content = oneLine(src.content || src.text || src.body || src.summary || src.note || "");
  if (!content) return null;
  return {
    id: src.id || null,
    title: oneLine(src.title || src.label || `${domain}_knowledge`) || `${domain}_knowledge`,
    content,
    summary: oneLine(src.summary || content.slice(0, 220)),
    source: oneLine(src.source || source) || source,
    domain: canonicalDomain(src.domain || domain),
    score: clamp01(src.score, 0.76),
    confidence: clamp01(src.confidence != null ? src.confidence : src.score, 0.76),
    tags: arr(src.tags).map(oneLine).filter(Boolean).slice(0, 8)
  };
}
function makeSections() {
  const out = {};
  for (const d of DOMAINS) out[d] = [];
  return out;
}
function inferDomain(query = "", marion = {}) {
  const forced = canonicalDomain(marion?.domain || marion?.meta?.domain || marion?.packet?.synthesis?.domain || "");
  if (forced !== "general") return forced;
  const q = safeStr(query);
  for (const [domain, rx] of Object.entries(KEYWORD_MAP)) {
    if (rx.test(q)) return domain;
  }
  return "general";
}
function foldSources(query = "", opts = {}) {
  const sections = makeSections();
  const push = (domain, value, source) => {
    const items = Array.isArray(value) ? value : (value ? [value] : []);
    for (const item of items) {
      const normalized = normalizeItem(item, domain, source);
      if (normalized) sections[domain].push(normalized);
    }
  };

  const direct = [opts.knowledgeSections, opts.sections, opts.knowledge, opts.marion?.knowledgeSections].filter(isObj);
  for (const bag of direct) {
    for (const domain of DOMAINS) push(domain, bag[domain], `knowledge.${domain}`);
  }

  const marionEvidence = arr(opts.marion?.evidence || opts.marion?.packet?.evidence);
  const marionDomain = inferDomain(query, opts.marion);
  for (const item of marionEvidence) {
    const normalized = normalizeItem(item, canonicalDomain(item?.domain || marionDomain), "marion.evidence");
    if (normalized) sections[normalized.domain].push(normalized);
  }

  const guidedPrompt = isObj(opts.guidedPrompt) ? opts.guidedPrompt : null;
  if (guidedPrompt) {
    const domain = canonicalDomain(guidedPrompt.domainHint || marionDomain);
    const text = oneLine(guidedPrompt.label || guidedPrompt.text || guidedPrompt.prompt || "");
    if (text) sections[domain].push(normalizeItem({ title: "guided_prompt", content: text, tags: ["guided_prompt"] }, domain, "guided.prompt"));
  }

  const fallbackDomain = inferDomain(query, opts.marion);
  if (!sections[fallbackDomain].length && oneLine(query)) {
    sections[fallbackDomain].push(normalizeItem({
      title: `${fallbackDomain}_query_context`,
      content: oneLine(query),
      summary: oneLine(query).slice(0, 220),
      score: 0.64,
      confidence: 0.64,
      tags: [fallbackDomain, "query"]
    }, fallbackDomain, "query.context"));
  }

  for (const domain of DOMAINS) {
    sections[domain] = uniqBy(sections[domain], (item) => `${item.domain}|${item.source}|${item.content.toLowerCase()}`).slice(0, 10);
  }

  return sections;
}
function buildDiagnostics(sections) {
  const counts = {};
  let total = 0;
  for (const d of DOMAINS) {
    counts[d] = arr(sections[d]).length;
    total += counts[d];
  }
  return { counts, total, loaded: total > 0 };
}
function extract(query = "", opts = {}) {
  const sections = foldSources(query, opts);
  const diagnostics = buildDiagnostics(sections);
  const primaryDomain = inferDomain(query, opts.marion);
  return {
    ok: true,
    loaded: diagnostics.loaded,
    extracted: true,
    source: "knowledge.runtime",
    version: VERSION,
    domain: primaryDomain,
    knowledgeSections: sections,
    sections,
    diagnostics,
    ...sections
  };
}

function retrieve(query = "", opts = {}) {
  return extract(query, opts);
}

module.exports = {
  VERSION,
  DOMAINS,
  canonicalDomain,
  normalizeItem,
  inferDomain,
  extract,
  retrieve,
  default: { extract, retrieve }
};

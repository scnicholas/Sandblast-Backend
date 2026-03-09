/**
 * evidenceEngine.js
 * Marion evidence collection + ranking core
 *
 * Purpose:
 * - Collect evidence from multiple knowledge lanes
 * - Normalize, rank, dedupe, and trace evidence
 * - Lift memory into scoring
 * - Reduce repeat loops and weak fallback behavior
 * - Support operational intelligence phases 1–15
 */

'use strict';

const DEFAULT_PHASE_FLAGS = Object.freeze({
  phase01_normalization: true,
  phase02_laneCollection: true,
  phase03_memoryLift: true,
  phase04_authoritativeWeighting: true,
  phase05_relevanceScoring: true,
  phase06_dedupeControl: true,
  phase07_loopResistance: true,
  phase08_fallbackSafety: true,
  phase09_traceability: true,
  phase10_domainBias: true,
  phase11_confidenceShaping: true,
  phase12_sourceDiversity: true,
  phase13_thinEvidenceRecovery: true,
  phase14_payloadHardening: true,
  phase15_operationalDiagnostics: true,
});

const DEFAULT_WEIGHTS = Object.freeze({
  marion: 24,
  domain: 18,
  memory: 14,
  datasets: 12,
  official: 8,
  trusted: 6,
  traceable: 5,
  domainTag: 10,
  intentTag: 7,
  sentimentTag: 3,
  memoryHint: 2,
  repeatedPenalty: -16,
  longPenalty: -3,
  emptyPenalty: -50,
  fallbackPenalty: -10,
  diversityBonus: 4,
});

function noopAsync() {
  return Promise.resolve(null);
}

function safeNowISO() {
  try {
    return new Date().toISOString();
  } catch {
    return '';
  }
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9_!?'"-]+/i)
    .filter(Boolean);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function uniqueStrings(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean).map(String))];
}

function hashLite(input) {
  const s = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function buildTraceId(seed) {
  return `ev_${hashLite(seed || safeNowISO())}`;
}

function safeCall(fn, fallback) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (typeof fallback === 'function') return fallback(error, ...args);
      return fallback;
    }
  };
}

class RepeatGuard {
  constructor(limit = 4) {
    this.limit = clamp(limit, 1, 20);
    this.map = new Map();
  }

  hit(key) {
    const next = (this.map.get(key) || 0) + 1;
    this.map.set(key, next);
    return {
      count: next,
      repeated: next >= this.limit,
    };
  }

  reset(key) {
    this.map.delete(key);
  }
}

function normalizeItem(raw, lane, traceId) {
  const title = normalizeText(raw && raw.title) || `${lane}_evidence`;
  const content = normalizeText(raw && raw.content);
  const source = normalizeText(raw && raw.source) || lane;
  const sourceType = normalizeText(raw && raw.sourceType) || lane;
  const tags = uniqueStrings(raw && raw.tags);
  const authority = normalizeText(raw && raw.authority) || sourceType;
  const confidence = clamp(Number(raw && raw.confidence) || 0, 0, 1);
  const timestamp = normalizeText(raw && raw.timestamp) || '';
  const citation = normalizeText(raw && raw.citation) || '';
  const provenance = raw && raw.provenance ? raw.provenance : {};
  const metadata = raw && raw.metadata ? raw.metadata : {};

  return {
    id: normalizeText(raw && raw.id) || `${lane}_${hashLite(title + content.slice(0, 120))}`,
    lane,
    title,
    content,
    source,
    sourceType,
    tags,
    authority,
    confidence,
    timestamp,
    citation,
    provenance: {
      traceId,
      ...provenance,
    },
    metadata,
    score: 0,
    diagnostics: {},
  };
}

function normalizeLanePayload(payload, lane, traceId) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map(item => normalizeItem(item, lane, traceId))
    .filter(item => item.content);
}

function authoritativeWeight(item, weights) {
  const sourceType = item.sourceType.toLowerCase();
  const authority = item.authority.toLowerCase();
  let score = 0;

  if (sourceType.includes('marion')) score += weights.marion;
  if (sourceType.includes('domain')) score += weights.domain;
  if (sourceType.includes('memory')) score += weights.memory;
  if (sourceType.includes('dataset')) score += weights.datasets;

  if (authority.includes('official')) score += weights.official;
  if (authority.includes('trusted') || authority.includes('primary')) score += weights.trusted;
  if (item.citation || item.timestamp) score += weights.traceable;

  return score;
}

function semanticScore(item, context, weights) {
  const text = `${item.title} ${item.content}`.toLowerCase();
  let score = 0;

  if (context.domain && item.tags.includes(context.domain)) score += weights.domainTag;
  if (context.intent && item.tags.includes(context.intent)) score += weights.intentTag;
  if (context.sentiment && item.tags.includes(context.sentiment)) score += weights.sentimentTag;

  for (const token of context.tokens) {
    if (token && text.includes(token)) score += 1;
  }

  for (const hint of context.memoryHints) {
    if (hint && text.includes(hint.toLowerCase())) score += weights.memoryHint;
  }

  if (item.content.length > 900) score += weights.longPenalty;
  if (item.content.length < 12) score += weights.emptyPenalty;
  if (item.metadata && item.metadata.isFallback) score += weights.fallbackPenalty;
  if (/loop|repeat|same answer|duplicate/i.test(item.content)) score += weights.repeatedPenalty;

  score += clamp(item.confidence * 10, 0, 10);
  return score;
}

function computeScore(item, context, weights) {
  const auth = authoritativeWeight(item, weights);
  const sem = semanticScore(item, context, weights);
  return {
    ...item,
    score: auth + sem,
    diagnostics: {
      authoritative: auth,
      semantic: sem,
    },
  };
}

function dedupeItems(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const sig = hashLite([
      item.title.toLowerCase(),
      item.content.slice(0, 240).toLowerCase(),
      item.source.toLowerCase(),
    ].join('|'));

    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
  }

  return out;
}

function promoteDiversity(items, weights) {
  const usedSources = new Set();
  return items.map(item => {
    let bonus = 0;
    if (!usedSources.has(item.source)) {
      bonus += weights.diversityBonus;
      usedSources.add(item.source);
    }
    return {
      ...item,
      score: item.score + bonus,
      diagnostics: {
        ...item.diagnostics,
        diversityBonus: bonus,
      },
    };
  });
}

function buildFallbackEvidence(context, traceId) {
  return [{
    id: `fallback_${hashLite(context.text || traceId)}`,
    lane: 'fallback',
    title: 'Fallback operational synthesis',
    content: `Evidence was thin for the ${context.domain || 'general'} lane in ${context.intent || 'general'} mode. Respond cautiously, stay explicit about uncertainty, and prefer a grounded next-step rather than speculative detail.`,
    source: 'fallback_safety',
    sourceType: 'fallback',
    tags: uniqueStrings([context.domain, context.intent, 'fallback']),
    authority: 'trusted_fallback',
    confidence: 0.42,
    timestamp: safeNowISO(),
    citation: '',
    provenance: { traceId, generated: true },
    metadata: { isFallback: true },
    score: 0,
    diagnostics: {},
  }];
}

function summarizeDiagnostics(items) {
  const sourceCounts = {};
  for (const item of items) {
    sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
  }
  return {
    count: items.length,
    bySource: sourceCounts,
    topScore: items[0] ? items[0].score : 0,
    thinEvidence: items.length < 2,
  };
}

function createEvidenceEngine(config = {}) {
  const {
    logger = console,
    telemetry = { track: noopAsync },
    datasetsProvider = { search: noopAsync },
    domainKnowledgeProvider = { search: noopAsync },
    memoryProvider = { getEvidence: noopAsync },
    marionKnowledgeProvider = { search: noopAsync },
    phaseFlags = {},
    weights = {},
    laneTimeoutMs = 1800,
    repeatLimit = 4,
    maxPerLane = 6,
    maxOutput = 10,
  } = config;

  const phases = { ...DEFAULT_PHASE_FLAGS, ...(phaseFlags || {}) };
  const effectiveWeights = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const repeatGuard = new RepeatGuard(repeatLimit);
  const track = safeCall(telemetry.track || noopAsync, () => null);

  const datasetSearch = safeCall(datasetsProvider.search || noopAsync, () => []);
  const domainSearch = safeCall(domainKnowledgeProvider.search || noopAsync, () => []);
  const memorySearch = safeCall(memoryProvider.getEvidence || noopAsync, () => []);
  const marionSearch = safeCall(marionKnowledgeProvider.search || noopAsync, () => []);

  function withTimeout(promise, ms, fallback = []) {
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(fallback);
        }
      }, ms);

      Promise.resolve(promise)
        .then(value => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(value);
          }
        })
        .catch(() => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(fallback);
          }
        });
    });
  }

  async function collect(context = {}) {
    const text = normalizeText(context.text);
    const tokens = Array.isArray(context.tokens) ? context.tokens : tokenize(text);
    const intent = normalizeText(context.intent) || 'general';
    const domain = normalizeText(context.domain) || 'general';
    const sentiment = normalizeText(context.sentiment) || 'neutral';
    const sessionId = normalizeText(context.sessionId) || 'session_unknown';
    const userId = normalizeText(context.userId) || 'user_unknown';
    const turnId = normalizeText(context.turnId) || `turn_${Date.now()}`;
    const traceId = normalizeText(context.traceId) || buildTraceId([sessionId, turnId, text].join('|'));
    const meta = context.meta || {};
    const memoryHints = uniqueStrings(context.memoryHints || []).slice(0, 12);

    const requestKey = hashLite(`${sessionId}|${domain}|${intent}|${text.toLowerCase()}`);
    const repeat = phases.phase07_loopResistance
      ? repeatGuard.hit(requestKey)
      : { count: 1, repeated: false };

    const collectionContext = {
      text, tokens, intent, domain, sentiment,
      sessionId, userId, turnId, traceId, meta, memoryHints,
    };

    const laneQueries = {
      marion: { text, domain, intent, sentiment, traceId, memoryHints, meta },
      domain: { text, domain, intent, traceId, memoryHints, meta },
      memory: { text, domain, sessionId, userId, turnId, traceId, memoryHints },
      datasets: { text, domain, intent, traceId, meta },
    };

    const [marionRaw, domainRaw, memoryRaw, datasetsRaw] = await Promise.all([
      phases.phase02_laneCollection ? withTimeout(marionSearch(laneQueries.marion), laneTimeoutMs, []) : [],
      phases.phase02_laneCollection ? withTimeout(domainSearch(laneQueries.domain), laneTimeoutMs, []) : [],
      phases.phase03_memoryLift ? withTimeout(memorySearch(laneQueries.memory), laneTimeoutMs, []) : [],
      phases.phase02_laneCollection ? withTimeout(datasetSearch(laneQueries.datasets), laneTimeoutMs, []) : [],
    ]);

    let items = [
      ...normalizeLanePayload(marionRaw, 'marion', traceId).slice(0, maxPerLane),
      ...normalizeLanePayload(domainRaw, 'domain', traceId).slice(0, maxPerLane),
      ...normalizeLanePayload(memoryRaw, 'memory', traceId).slice(0, maxPerLane),
      ...normalizeLanePayload(datasetsRaw, 'datasets', traceId).slice(0, maxPerLane),
    ];

    if (phases.phase14_payloadHardening) {
      items = items.filter(item => item && item.content && item.source && item.title && item.provenance && item.provenance.traceId);
    }

    items = items.map(item => computeScore(item, collectionContext, effectiveWeights));

    if (phases.phase10_domainBias && domain !== 'general') {
      items = items.map(item => {
        const bias = item.tags.includes(domain) ? 6 : 0;
        return {
          ...item,
          score: item.score + bias,
          diagnostics: {
            ...item.diagnostics,
            domainBias: bias,
          },
        };
      });
    }

    if (repeat.repeated) {
      items = items.map(item => ({
        ...item,
        score: item.score - 8,
        diagnostics: {
          ...item.diagnostics,
          repeatPenalty: 8,
        },
      }));
    }

    items = dedupeItems(items);
    items.sort((a, b) => b.score - a.score);

    if (phases.phase12_sourceDiversity) {
      items = promoteDiversity(items, effectiveWeights).sort((a, b) => b.score - a.score);
    }

    if (phases.phase11_confidenceShaping) {
      items = items.map(item => {
        const shapedConfidence = clamp((item.confidence || 0.4) + Math.min(item.score / 100, 0.35), 0.1, 0.97);
        return {
          ...item,
          confidence: shapedConfidence,
          diagnostics: {
            ...item.diagnostics,
            shapedConfidence,
          },
        };
      });
    }

    if (phases.phase13_thinEvidenceRecovery && items.length < 2) {
      const fallback = buildFallbackEvidence(collectionContext, traceId);
      items = [...items, ...fallback.map(item => computeScore(item, collectionContext, effectiveWeights))];
      items.sort((a, b) => b.score - a.score);
    }

    items = items.slice(0, maxOutput);
    const diagnostics = summarizeDiagnostics(items);

    await track({
      event: 'evidence_engine_collect',
      traceId, sessionId, userId, turnId, domain, intent,
      evidenceCount: diagnostics.count,
      thinEvidence: diagnostics.thinEvidence,
      repeatCount: repeat.count,
      topScore: diagnostics.topScore,
      bySource: diagnostics.bySource,
      phases,
      now: safeNowISO(),
    });

    try {
      if (logger && typeof logger.info === 'function' && phases.phase15_operationalDiagnostics) {
        logger.info('[evidenceEngine.collect]', {
          traceId, domain, intent,
          evidenceCount: diagnostics.count,
          thinEvidence: diagnostics.thinEvidence,
          repeatCount: repeat.count,
          topScore: diagnostics.topScore,
        });
      }
    } catch {
      // ignore logger failure
    }

    return items;
  }

  async function explain(context = {}) {
    const items = await collect(context);
    return {
      ok: true,
      engine: 'evidenceEngine.js',
      version: '1.0.0-opintel',
      traceId: context.traceId || '',
      phases,
      diagnostics: summarizeDiagnostics(items),
      top: items.slice(0, 5),
    };
  }

  async function healthcheck() {
    return {
      ok: true,
      engine: 'evidenceEngine.js',
      version: '1.0.0-opintel',
      phases,
      weights: effectiveWeights,
      now: safeNowISO(),
      lanes: {
        marionKnowledgeProvider: !!marionKnowledgeProvider,
        domainKnowledgeProvider: !!domainKnowledgeProvider,
        memoryProvider: !!memoryProvider,
        datasetsProvider: !!datasetsProvider,
      },
    };
  }

  function resetRepeatGuard(sessionId = '', domain = '', intent = '', text = '') {
    const key = hashLite(`${sessionId}|${domain}|${intent}|${String(text).toLowerCase()}`);
    repeatGuard.reset(key);
    return { ok: true, key };
  }

  return {
    collect,
    explain,
    healthcheck,
    resetRepeatGuard,
  };
}

module.exports = {
  createEvidenceEngine,
  DEFAULT_PHASE_FLAGS,
  DEFAULT_WEIGHTS,
};

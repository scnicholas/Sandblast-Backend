/**
 * marionBridge.js
 * Nyx ↔ Marion operational bridge
 *
 * Purpose:
 * - Normalize inbound conversational requests
 * - Detect intent/domain
 * - Pull memory/state context
 * - Query evidence engine(s)
 * - Return a hardened intelligence packet
 * - Reduce repeat loops and weak domain drift
 *
 * Designed for:
 * - Operational intelligence progression (phases 10–15 forward)
 * - Fail-open behavior
 * - Low-friction integration with chatEngine.js / index.js
 *
 * Expected integration:
 *   const { createMarionBridge } = require('./utils/marionBridge');
 *   const bridge = createMarionBridge({ ...deps });
 *   const packet = await bridge.resolve({ userText, sessionId, userId, turnId, meta });
 */

'use strict';

const DEFAULT_PHASE_FLAGS = Object.freeze({
  phase10_domainRouting: true,
  phase11_memoryLift: true,
  phase12_evidenceRanking: true,
  phase13_loopResistance: true,
  phase14_failOpenSynthesis: true,
  phase15_traceability: true,
});

const DEFAULT_DOMAIN_KEYWORDS = Object.freeze({
  psychology: ['anxious', 'hurt', 'stress', 'sad', 'lonely', 'relationship', 'emotion', 'grief', 'panic'],
  law: ['contract', 'legal', 'liability', 'lawsuit', 'court', 'policy', 'compliance', 'copyright'],
  finance: ['budget', 'revenue', 'profit', 'forecast', 'pricing', 'cost', 'grant', 'funding', 'roi'],
  language: ['rewrite', 'grammar', 'tone', 'summary', 'copy', 'pitch', 'headline', 'narrative'],
  ai_cyber: ['model', 'ai', 'agent', 'bridge', 'pipeline', 'security', 'auth', 'token', 'dataset', 'vector'],
  marketing_media: ['brand', 'audience', 'channel', 'roku', 'streaming', 'discovery', 'metadata', 'campaign'],
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function uniqueStrings(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean).map(String))];
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

function hashLite(input) {
  const s = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function buildTraceId({ sessionId, turnId, text }) {
  return `mb_${hashLite([sessionId, turnId, text].join('|'))}`;
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

class SimpleLoopGuard {
  constructor(limit = 3) {
    this.limit = clamp(limit, 1, 12);
    this.map = new Map();
  }

  check(key) {
    const next = (this.map.get(key) || 0) + 1;
    this.map.set(key, next);
    return {
      count: next,
      tripped: next >= this.limit,
    };
  }

  reset(key) {
    this.map.delete(key);
  }
}

function scoreDomain(tokens, text, keywordsByDomain) {
  const lower = text.toLowerCase();
  const scored = Object.entries(keywordsByDomain).map(([domain, keywords]) => {
    let score = 0;
    for (const word of keywords) {
      if (tokens.includes(word)) score += 2;
      if (lower.includes(word)) score += 1;
    }
    return { domain, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0] || { domain: 'general', score: 0 };
  return {
    primary: top.score > 0 ? top.domain : 'general',
    candidates: scored.filter(x => x.score > 0).slice(0, 3),
  };
}

function inferIntent(text) {
  const t = text.toLowerCase();
  if (!t) return 'empty';
  if (/(help|how do i|what should|recommend|advise)/.test(t)) return 'guidance';
  if (/(fix|debug|error|broken|issue|bug|doesn't work|not working)/.test(t)) return 'diagnostic';
  if (/(write|rewrite|draft|summarize|improve|pitch)/.test(t)) return 'composition';
  if (/(plan|roadmap|steps|phase|sequence|priority)/.test(t)) return 'planning';
  if (/(who|what|when|where|why)/.test(t)) return 'qa';
  return 'general';
}

function sentimentHint(text) {
  const t = text.toLowerCase();
  if (/(overwhelmed|upset|hurt|stressed|panic|frustrated|angry|sad)/.test(t)) return 'distressed';
  if (/(great|good|amazing|love|excited|confident)/.test(t)) return 'positive';
  return 'neutral';
}

function packetSkeleton() {
  return {
    ok: true,
    bridge: 'marionBridge.js',
    version: '1.0.0-opintel',
    traceId: '',
    now: safeNowISO(),
    phases: { ...DEFAULT_PHASE_FLAGS },
    input: {},
    routing: {},
    memory: {},
    evidence: {},
    synthesis: {},
    guardrails: {},
    diagnostics: {},
    errors: [],
  };
}

function buildResponseMode({ intent, sentiment, domain }) {
  const concise = intent === 'diagnostic' || intent === 'planning';
  const warmth = sentiment === 'distressed' ? 'high' : 'moderate';
  const style =
    domain === 'finance' ? 'analytical' :
    domain === 'law' ? 'careful' :
    domain === 'psychology' ? 'supportive' :
    'clear';
  return { concise, warmth, style };
}

function normalizeEvidenceItems(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const title = item && item.title ? String(item.title) : `evidence_${index + 1}`;
    const content = normalizeText(item && item.content);
    const source = item && item.source ? String(item.source) : 'unknown';
    const score = Number(item && item.score) || 0;
    const tags = uniqueStrings(item && item.tags);
    return { title, content, source, score, tags };
  }).filter(x => x.content);
}

function rankEvidence({ items, domain, intent, memoryHints }) {
  const hints = tokenize((memoryHints || []).join(' '));
  const ranked = normalizeEvidenceItems(items).map(item => {
    let score = item.score || 0;
    const itemText = `${item.title} ${item.content}`.toLowerCase();

    if (domain !== 'general' && item.tags.includes(domain)) score += 15;
    if (intent && item.tags.includes(intent)) score += 8;
    for (const hint of hints) {
      if (hint && itemText.includes(hint)) score += 2;
    }
    if (/official|primary|trusted|memory|domain/i.test(item.source)) score += 5;
    if (item.content.length > 600) score -= 2; // discourage overlong blocks

    return { ...item, score };
  }).sort((a, b) => b.score - a.score);

  const deduped = [];
  const seen = new Set();
  for (const item of ranked) {
    const sig = hashLite(`${item.title}|${item.content.slice(0, 180)}`);
    if (seen.has(sig)) continue;
    seen.add(sig);
    deduped.push(item);
    if (deduped.length >= 8) break;
  }
  return deduped;
}

function buildFallbackAnswer({ text, domain, intent }) {
  return {
    mode: 'fail-open',
    answer: `I can help with this. I’m routing it through the ${domain} lane in ${intent} mode, but the knowledge path returned thin evidence, so this response should be treated as provisional until the evidence layer fills in.`,
    confidence: 0.42,
    nextAction: 'fallback_synthesis',
  };
}

function defaultSynthesize({ text, domain, intent, evidence, responseMode }) {
  const bullets = evidence.slice(0, 3).map(item => item.content);
  const stitched = bullets.join(' ').trim();
  const answer = stitched || buildFallbackAnswer({ text, domain, intent }).answer;
  const confidence = evidence.length ? clamp(0.55 + (evidence.length * 0.08), 0.55, 0.92) : 0.42;

  return {
    mode: responseMode,
    answer,
    confidence,
    cites: evidence.map(item => ({ title: item.title, source: item.source })).slice(0, 4),
    nextAction: confidence < 0.6 ? 'clarify_or_expand' : 'respond',
  };
}

function createMarionBridge(config = {}) {
  const {
    logger = console,
    phaseFlags = {},
    domainKeywords = DEFAULT_DOMAIN_KEYWORDS,
    loopLimit = 3,

    // Dependencies
    memoryProvider = { getContext: noopAsync, putContext: noopAsync },
    evidenceEngine = { collect: noopAsync },
    domainRouter = null,
    synthesize = null,
    telemetry = { track: noopAsync },

    // Behavior
    maxInputChars = 3000,
    maxMemoryHints = 8,
  } = config;

  const phases = { ...DEFAULT_PHASE_FLAGS, ...(phaseFlags || {}) };
  const loopGuard = new SimpleLoopGuard(loopLimit);

  const getMemory = safeCall(memoryProvider.getContext || noopAsync, () => null);
  const putMemory = safeCall(memoryProvider.putContext || noopAsync, () => null);
  const collectEvidence = safeCall(evidenceEngine.collect || noopAsync, () => []);
  const track = safeCall(telemetry.track || noopAsync, () => null);

  async function resolve(request = {}) {
    const packet = packetSkeleton();
    const rawText = normalizeText(request.userText).slice(0, maxInputChars);
    const sessionId = String(request.sessionId || 'session_unknown');
    const userId = String(request.userId || 'user_unknown');
    const turnId = String(request.turnId || `turn_${Date.now()}`);
    const meta = request.meta || {};
    const traceId = buildTraceId({ sessionId, turnId, text: rawText });

    packet.traceId = traceId;
    packet.input = {
      text: rawText,
      sessionId,
      userId,
      turnId,
      meta,
    };

    if (!rawText) {
      packet.ok = false;
      packet.errors.push('empty_input');
      packet.synthesis = buildFallbackAnswer({ text: rawText, domain: 'general', intent: 'empty' });
      return packet;
    }

    const loopSignature = hashLite(`${sessionId}|${rawText.toLowerCase()}`);
    const loop = phases.phase13_loopResistance ? loopGuard.check(loopSignature) : { count: 1, tripped: false };

    const tokens = tokenize(rawText);
    const intent = inferIntent(rawText);
    const sentiment = sentimentHint(rawText);

    let domainResult = scoreDomain(tokens, rawText, domainKeywords);

    if (domainRouter && typeof domainRouter.route === 'function') {
      try {
        const override = await domainRouter.route({
          text: rawText,
          tokens,
          intent,
          sentiment,
          sessionId,
          userId,
          meta,
        });
        if (override && override.primary) {
          domainResult = {
            primary: String(override.primary),
            candidates: Array.isArray(override.candidates) ? override.candidates : domainResult.candidates,
          };
        }
      } catch (error) {
        packet.errors.push(`domain_router_failed:${error.message}`);
      }
    }

    const primaryDomain = domainResult.primary;
    const responseMode = buildResponseMode({ intent, sentiment, domain: primaryDomain });

    packet.routing = {
      intent,
      sentiment,
      domain: primaryDomain,
      candidates: domainResult.candidates,
      responseMode,
    };

    const memoryContext = phases.phase11_memoryLift
      ? await getMemory({
          sessionId,
          userId,
          turnId,
          domain: primaryDomain,
          intent,
          text: rawText,
          meta,
        })
      : null;

    const memoryHints = uniqueStrings([
      memoryContext && memoryContext.lastIntent,
      memoryContext && memoryContext.lastDomain,
      ...(memoryContext && Array.isArray(memoryContext.openLoops) ? memoryContext.openLoops : []),
      ...(memoryContext && Array.isArray(memoryContext.userPreferences) ? memoryContext.userPreferences : []),
      ...(memoryContext && Array.isArray(memoryContext.recentTopics) ? memoryContext.recentTopics : []),
    ]).slice(0, maxMemoryHints);

    packet.memory = {
      found: !!memoryContext,
      hints: memoryHints,
      continuity: {
        lastIntent: memoryContext && memoryContext.lastIntent || null,
        lastDomain: memoryContext && memoryContext.lastDomain || null,
        unresolved: memoryContext && memoryContext.openLoops || [],
      },
    };

    let evidenceRaw = [];
    if (phases.phase12_evidenceRanking) {
      evidenceRaw = await collectEvidence({
        text: rawText,
        tokens,
        intent,
        domain: primaryDomain,
        sentiment,
        sessionId,
        userId,
        turnId,
        meta,
        memoryHints,
        traceId,
      });
    }

    const rankedEvidence = rankEvidence({
      items: evidenceRaw,
      domain: primaryDomain,
      intent,
      memoryHints,
    });

    packet.evidence = {
      count: rankedEvidence.length,
      top: rankedEvidence.slice(0, 5),
      sources: uniqueStrings(rankedEvidence.map(x => x.source)),
    };

    if (loop.tripped) {
      packet.guardrails.loopGuard = {
        active: true,
        count: loop.count,
        action: 'deepen_or_redirect',
      };
      packet.routing.responseMode.concise = true;
    } else {
      packet.guardrails.loopGuard = {
        active: false,
        count: loop.count,
        action: 'none',
      };
    }

    let synthesis;
    try {
      if (synthesize && typeof synthesize === 'function') {
        synthesis = await synthesize({
          text: rawText,
          intent,
          domain: primaryDomain,
          sentiment,
          memory: packet.memory,
          evidence: rankedEvidence,
          responseMode,
          loopGuard: packet.guardrails.loopGuard,
          traceId,
        });
      } else {
        synthesis = defaultSynthesize({
          text: rawText,
          domain: primaryDomain,
          intent,
          evidence: rankedEvidence,
          responseMode,
        });
      }
    } catch (error) {
      packet.errors.push(`synthesis_failed:${error.message}`);
      synthesis = null;
    }

    if (!synthesis || !synthesis.answer) {
      synthesis = buildFallbackAnswer({
        text: rawText,
        domain: primaryDomain,
        intent,
      });
    }

    packet.synthesis = synthesis;
    packet.diagnostics = {
      confidence: Number(synthesis.confidence || 0),
      usedFallback: synthesis.mode === 'fail-open' || synthesis.nextAction === 'fallback_synthesis',
      evidenceThin: rankedEvidence.length < 2,
      traceReady: phases.phase15_traceability,
    };

    const memoryWrite = {
      sessionId,
      userId,
      turnId,
      traceId,
      lastIntent: intent,
      lastDomain: primaryDomain,
      recentTopics: uniqueStrings([primaryDomain, intent, ...tokens.slice(0, 6)]).slice(0, 10),
      openLoops: synthesis.nextAction === 'clarify_or_expand' ? [rawText.slice(0, 120)] : [],
      lastConfidence: Number(synthesis.confidence || 0),
      updatedAt: safeNowISO(),
    };

    await putMemory(memoryWrite);

    await track({
      event: 'marion_bridge_resolve',
      traceId,
      sessionId,
      userId,
      turnId,
      intent,
      domain: primaryDomain,
      evidenceCount: rankedEvidence.length,
      confidence: memoryWrite.lastConfidence,
      fallback: packet.diagnostics.usedFallback,
      loopCount: loop.count,
    });

    try {
      if (logger && typeof logger.info === 'function') {
        logger.info('[marionBridge.resolve]', {
          traceId,
          intent,
          domain: primaryDomain,
          evidenceCount: rankedEvidence.length,
          confidence: memoryWrite.lastConfidence,
          fallback: packet.diagnostics.usedFallback,
        });
      }
    } catch {
      // no-op logging failure
    }

    return packet;
  }

  async function healthcheck() {
    const now = safeNowISO();
    const checks = {
      memoryProvider: !!memoryProvider,
      evidenceEngine: !!evidenceEngine,
      telemetry: !!telemetry,
      phases,
      now,
    };
    return {
      ok: true,
      bridge: 'marionBridge.js',
      version: '1.0.0-opintel',
      checks,
    };
  }

  function resetLoop(sessionId, text = '') {
    const key = hashLite(`${sessionId}|${String(text).toLowerCase()}`);
    loopGuard.reset(key);
    return { ok: true, key };
  }

  return {
    resolve,
    healthcheck,
    resetLoop,
  };
}

module.exports = {
  createMarionBridge,
  DEFAULT_PHASE_FLAGS,
  DEFAULT_DOMAIN_KEYWORDS,
};

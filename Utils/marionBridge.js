/**
 * marionBridge.js
 * Nyx ↔ Marion controlled bridge
 *
 * Purpose:
 * - Keep Marion out of direct chatEngine hot-path orchestration
 * - Normalize inbound conversational requests
 * - Decide when Marion should be invoked
 * - Pull memory/state context
 * - Query evidence engine(s)
 * - Query MarionSO only through this bridge
 * - Return a hardened intelligence packet
 * - Reduce repeat loops and weak domain drift
 *
 * IMPORTANT:
 * - chatEngine.js should import THIS bridge, not MarionSO directly.
 * - MarionSO remains available, but only behind bridge control.
 */
'use strict';

let EmotionRouteGuard = null;
try { EmotionRouteGuard = require('./emotionRouteGuard'); } catch (_e) { EmotionRouteGuard = null; }

const BRIDGE_VERSION = '1.3.0-opintel-emotion-coupled-loop-hardened';

const DEFAULT_PHASE_FLAGS = Object.freeze({
  phase10_domainRouting: true,
  phase11_memoryLift: true,
  phase12_evidenceRanking: true,
  phase13_loopResistance: true,
  phase14_failOpenSynthesis: true,
  phase15_traceability: true,
  phase16_bridgeGating: true,
  phase17_marionIsolation: true,
});

const DEFAULT_DOMAIN_KEYWORDS = Object.freeze({
  psychology: ['anxious', 'hurt', 'stress', 'sad', 'lonely', 'relationship', 'emotion', 'grief', 'panic', 'overwhelmed'],
  law: ['contract', 'legal', 'liability', 'lawsuit', 'court', 'policy', 'compliance', 'copyright'],
  finance: ['budget', 'revenue', 'profit', 'forecast', 'pricing', 'cost', 'grant', 'funding', 'roi'],
  language: ['rewrite', 'grammar', 'tone', 'summary', 'copy', 'pitch', 'headline', 'narrative'],
  ai_cyber: ['model', 'ai', 'agent', 'bridge', 'pipeline', 'security', 'auth', 'token', 'dataset', 'vector'],
  marketing_media: ['brand', 'audience', 'channel', 'roku', 'streaming', 'discovery', 'metadata', 'campaign'],
  support: ['help me understand', 'stay with me', 'i am overwhelmed', 'i feel off', 'walk me through'],
});

function noopAsync() {
  return Promise.resolve(null);
}

function safeNowISO() {
  try { return new Date().toISOString(); } catch { return ''; }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function uniqueStrings(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean).map(String))];
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/[^\S\r\n]+/g, ' ').trim();
}

function normalizeEmotionMeta(emotion) {
  const e = emotion && typeof emotion === 'object' ? emotion : {};
  const nuance = e.nuanceProfile && typeof e.nuanceProfile === 'object' ? e.nuanceProfile : {};
  const plan = e.conversationPlan && typeof e.conversationPlan === 'object' ? e.conversationPlan : {};
  return {
    mode: String(e.mode || 'NORMAL'),
    primaryEmotion: String(e.primaryEmotion || e.dominantEmotion || ''),
    emotionCluster: String(e.emotionCluster || ''),
    routeBias: String(e.routeBias || ''),
    supportModeCandidate: String(e.supportModeCandidate || ''),
    fallbackSuppression: !!e.fallbackSuppression,
    needsNovelMove: !!e.needsNovelMove,
    routeExhaustion: !!e.routeExhaustion,
    supportFlags: e.supportFlags && typeof e.supportFlags === 'object' ? e.supportFlags : {},
    nuanceProfile: {
      archetype: String(nuance.archetype || 'clarify'),
      conversationNeed: String(nuance.conversationNeed || 'clarify'),
      transitionReadiness: String(nuance.transitionReadiness || 'medium'),
      loopRisk: String(nuance.loopRisk || 'medium'),
      questionPressure: String(nuance.questionPressure || 'medium'),
      mirrorDepth: String(nuance.mirrorDepth || 'medium')
    },
    conversationPlan: {
      shouldUseSupportLock: !!plan.shouldUseSupportLock,
      shouldSuppressMenus: !!plan.shouldSuppressMenus,
      shouldSuppressLaneRouting: !!plan.shouldSuppressLaneRouting,
      askAllowed: plan.askAllowed === false ? false : true,
      followupStyle: String(plan.followupStyle || 'reflective'),
      recommendedDepth: String(plan.recommendedDepth || 'standard'),
      primaryArchetype: String(plan.primaryArchetype || nuance.archetype || 'clarify'),
      conversationNeed: String(plan.conversationNeed || nuance.conversationNeed || 'clarify'),
      loopRisk: String(plan.loopRisk || nuance.loopRisk || 'medium'),
      transitionReadiness: String(plan.transitionReadiness || nuance.transitionReadiness || 'medium'),
      antiLoopShift: String(plan.antiLoopShift || nuance.antiLoopShift || '')
    }
  };
}

function analyzeEmotionFallback(text, priorState) {
  try {
    if (EmotionRouteGuard && typeof EmotionRouteGuard.analyzeEmotionRoute === 'function') {
      return normalizeEmotionMeta(EmotionRouteGuard.analyzeEmotionRoute({ text }, priorState || {}));
    }
  } catch {}
  return normalizeEmotionMeta(null);
}

function tokenize(text) {
  return normalizeText(text).toLowerCase().split(/[^a-z0-9_!?'"-]+/i).filter(Boolean);
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
    return { count: next, tripped: next >= this.limit };
  }
  reset(key) {
    this.map.delete(key);
  }
}

function scoreDomain(tokens, text, keywordsByDomain) {
  const lower = String(text || '').toLowerCase();
  const scored = Object.entries(keywordsByDomain).map(([domain, keywords]) => {
    let score = 0;
    for (const word of Array.isArray(keywords) ? keywords : []) {
      const w = String(word).toLowerCase();
      if (tokens.includes(w)) score += 2;
      if (lower.includes(w)) score += 1;
    }
    return { domain, score };
  }).sort((a, b) => b.score - a.score);
  const top = scored[0] || { domain: 'general', score: 0 };
  return { primary: top.score > 0 ? top.domain : 'general', candidates: scored.filter(x => x.score > 0).slice(0, 3) };
}

function choosePreferredDomain(domainResult, emotion, requestMeta) {
  const result = domainResult && typeof domainResult === 'object' ? domainResult : { primary: 'general', candidates: [] };
  const emo = normalizeEmotionMeta(emotion);
  const knowledgeSections = requestMeta && requestMeta.knowledgeSections && typeof requestMeta.knowledgeSections === 'object'
    ? requestMeta.knowledgeSections
    : {};
  const hasPsych = Array.isArray(knowledgeSections.psychology) && knowledgeSections.psychology.length > 0;
  const distressed = emo.mode === 'VULNERABLE' || emo.supportFlags.highDistress || emo.supportFlags.needsConnection || emo.conversationPlan.shouldUseSupportLock;
  if (distressed && (hasPsych || result.primary === 'general' || result.primary === 'support')) {
    const candidates = uniqueStrings(['psychology', ...(Array.isArray(result.candidates) ? result.candidates.map((x) => x.domain || x) : [])])
      .slice(0, 3)
      .map((x) => typeof x === 'string' ? { domain: x, score: x === 'psychology' ? 999 : 1 } : x);
    return { primary: 'psychology', candidates };
  }
  return result;
}

function inferIntent(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return 'empty';
  if (/(help|how do i|what should|recommend|advise)/.test(t)) return 'guidance';
  if (/(fix|debug|error|broken|issue|bug|doesn't work|not working)/.test(t)) return 'diagnostic';
  if (/(write|rewrite|draft|summarize|improve|pitch)/.test(t)) return 'composition';
  if (/(plan|roadmap|steps|phase|sequence|priority)/.test(t)) return 'planning';
  if (/(who|what|when|where|why|explain|compare|analyze)/.test(t)) return 'qa';
  return 'general';
}

function sentimentHint(text) {
  const t = String(text || '').toLowerCase();
  if (/(overwhelmed|upset|hurt|stressed|panic|frustrated|angry|sad)/.test(t)) return 'distressed';
  if (/(great|good|amazing|love|excited|confident)/.test(t)) return 'positive';
  return 'neutral';
}

function packetSkeleton() {
  return {
    ok: true,
    bridge: 'marionBridge.js',
    version: BRIDGE_VERSION,
    traceId: '',
    now: safeNowISO(),
    phases: { ...DEFAULT_PHASE_FLAGS },
    input: {},
    routing: {},
    memory: {},
    evidence: {},
    marion: {},
    synthesis: {},
    guardrails: {},
    diagnostics: {},
    errors: [],
  };
}

function buildResponseMode({ intent, sentiment, domain, emotion }) {
  const emo = normalizeEmotionMeta(emotion);
  const concise = intent === 'diagnostic' || intent === 'planning' || emo.conversationPlan.shouldSuppressMenus;
  const warmth = sentiment === 'distressed' || emo.supportFlags.needsConnection ? 'high' : 'moderate';
  const style = domain === 'finance' ? 'analytical'
    : domain === 'law' ? 'careful'
    : domain === 'psychology' || domain === 'support' ? 'supportive'
    : 'clear';
  return {
    concise,
    warmth,
    style,
    questionPressure: emo.nuanceProfile.questionPressure || 'medium',
    followupStyle: emo.conversationPlan.followupStyle || 'reflective',
    supportLock: !!emo.conversationPlan.shouldUseSupportLock
  };
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
    for (const hint of hints) if (hint && itemText.includes(hint)) score += 2;
    if (/official|primary|trusted|memory|domain/i.test(item.source)) score += 5;
    if (item.content.length > 600) score -= 2;
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

function buildFallbackAnswer({ domain, intent, emotion, evidenceThin = true }) {
  const emo = normalizeEmotionMeta(emotion);
  const supportive = emo.conversationPlan.shouldUseSupportLock || emo.supportFlags.highDistress || emo.supportFlags.needsConnection || domain === 'psychology';
  const answer = supportive
    ? 'I am here with you. I do not need to reopen menus or push you into another lane. Stay on this thread and give me the next line you want me to work with.'
    : `I can keep working on this directly. The Marion knowledge path is thin right now, so I will stay with the clearest available line instead of reopening menus or bouncing lanes.`;
  return {
    mode: 'fail-open',
    answer,
    confidence: evidenceThin ? 0.42 : 0.5,
    nextAction: 'respond',
    cites: [],
    supportCompatible: supportive,
    questionSuppression: supportive || emo.conversationPlan.askAllowed === false,
    avoidLaneRebuild: true,
    allowMenuRegeneration: false,
  };
}

function defaultSynthesize({ domain, intent, evidence, responseMode, marionResult, emotion }) {
  const emo = normalizeEmotionMeta(emotion);
  const marionAnswer = marionResult && typeof marionResult.answer === 'string' ? normalizeText(marionResult.answer) : '';
  if (marionAnswer) {
    return {
      mode: responseMode,
      answer: marionAnswer,
      confidence: clamp(Number(marionResult.confidence || 0.74), 0.35, 0.95),
      cites: Array.isArray(marionResult.cites) ? marionResult.cites.slice(0, 4) : [],
      nextAction: 'respond',
      supportCompatible: !!(marionResult.supportCompatible || emo.conversationPlan.shouldUseSupportLock),
      questionSuppression: !!(marionResult.questionSuppression || emo.conversationPlan.askAllowed === false),
      avoidLaneRebuild: marionResult.avoidLaneRebuild !== false,
      allowMenuRegeneration: false,
    };
  }
  const bullets = evidence.slice(0, 3).map(item => item.content);
  const stitched = bullets.join(' ').trim();
  if (!stitched) return buildFallbackAnswer({ domain, intent, emotion, evidenceThin: true });
  const confidence = clamp(0.55 + evidence.length * 0.08, 0.55, 0.92);
  return {
    mode: responseMode,
    answer: stitched,
    confidence,
    cites: evidence.map(item => ({ title: item.title, source: item.source })).slice(0, 4),
    nextAction: 'respond',
    supportCompatible: !!emo.conversationPlan.shouldUseSupportLock,
    questionSuppression: !!(emo.conversationPlan.askAllowed === false || emo.nuanceProfile.questionPressure === 'low' || emo.nuanceProfile.questionPressure === 'none'),
    avoidLaneRebuild: true,
    allowMenuRegeneration: false,
  };
}

function shouldInvokeMarion({ text, intent, domain, sentiment, emotion }) {
  const t = String(text || '').toLowerCase();
  const emo = normalizeEmotionMeta(emotion);
  if (!t) return false;
  if (emo.supportFlags.crisis) return false;
  if (emo.routeExhaustion || emo.needsNovelMove || emo.fallbackSuppression) return true;
  if (emo.conversationPlan.shouldUseSupportLock) return true;
  if (domain === 'general' && intent === 'general' && emo.mode === 'NORMAL') return false;
  if (domain === 'support' || domain === 'psychology') return true;
  if (['law', 'finance', 'ai_cyber', 'language', 'marketing_media'].includes(domain)) return true;
  if (['planning', 'qa', 'guidance', 'composition', 'diagnostic'].includes(intent)) return true;
  if (sentiment === 'distressed') return true;
  if (/(explain|compare|analyze|walk me through|help me understand)/.test(t)) return true;
  return false;
}

function extractMarionAnswer(result) {
  if (!result || typeof result !== 'object') return null;
  if (typeof result.answer === 'string' && result.answer.trim()) {
    return { answer: normalizeText(result.answer), confidence: Number(result.confidence || 0.74), cites: Array.isArray(result.cites) ? result.cites : [], nextAction: result.nextAction || 'respond', raw: result };
  }
  if (typeof result.reply === 'string' && result.reply.trim()) {
    return { answer: normalizeText(result.reply), confidence: Number(result.confidence || 0.72), cites: [], nextAction: 'respond', raw: result };
  }
  if (typeof result.text === 'string' && result.text.trim()) {
    return { answer: normalizeText(result.text), confidence: Number(result.confidence || 0.7), cites: [], nextAction: 'respond', raw: result };
  }
  return null;
}

function pickMarionMethod(marionSO) {
  if (!marionSO || typeof marionSO !== 'object') return null;
  for (const name of ['resolve', 'query', 'run', 'synthesize', 'respond', 'handle']) {
    if (typeof marionSO[name] === 'function') return name;
  }
  return null;
}

function createMarionBridge(config = {}) {
  const {
    logger = console,
    phaseFlags = {},
    domainKeywords = DEFAULT_DOMAIN_KEYWORDS,
    loopLimit = 3,
    marionSO = null,
    memoryProvider = { getContext: noopAsync, putContext: noopAsync },
    evidenceEngine = { collect: noopAsync },
    domainRouter = null,
    synthesize = null,
    telemetry = { track: noopAsync },
    maxInputChars = 3000,
    maxMemoryHints = 8,
  } = config;

  const phases = { ...DEFAULT_PHASE_FLAGS, ...(phaseFlags || {}) };
  const loopGuard = new SimpleLoopGuard(loopLimit);
  const marionMethod = pickMarionMethod(marionSO);
  const getMemory = safeCall(memoryProvider.getContext || noopAsync, () => null);
  const putMemory = safeCall(memoryProvider.putContext || noopAsync, () => null);
  const collectEvidence = safeCall(evidenceEngine.collect || noopAsync, () => []);
  const track = safeCall(telemetry.track || noopAsync, () => null);
  const invokeMarion = safeCall(async (payload) => {
    if (!marionSO || !marionMethod) return null;
    const result = await marionSO[marionMethod](payload);
    return extractMarionAnswer(result);
  }, () => null);

  function classify(request = {}) {
    const rawText = normalizeText(request.userText).slice(0, maxInputChars);
    const tokens = tokenize(rawText);
    const intent = inferIntent(rawText);
    const incomingEmotion = normalizeEmotionMeta(request.meta && request.meta.emotion);
    const inferredEmotion = incomingEmotion.primaryEmotion ? incomingEmotion : analyzeEmotionFallback(rawText, request.meta && request.meta.priorState);
    let sentiment = sentimentHint(rawText);
    if (inferredEmotion.mode === 'VULNERABLE' || inferredEmotion.supportFlags.highDistress) sentiment = 'distressed';
    const scoredDomain = scoreDomain(tokens, rawText, domainKeywords);
    const domainResult = choosePreferredDomain(scoredDomain, inferredEmotion, request.meta || {});
    const responseMode = buildResponseMode({ intent, sentiment, domain: domainResult.primary, emotion: inferredEmotion });
    return {
      text: rawText,
      tokens,
      intent,
      sentiment,
      domain: domainResult.primary,
      candidates: domainResult.candidates,
      responseMode,
      emotion: inferredEmotion,
      shouldUseMarion: shouldInvokeMarion({ text: rawText, intent, domain: domainResult.primary, sentiment, emotion: inferredEmotion }),
    };
  }

  async function resolve(request = {}) {
    const packet = packetSkeleton();
    const sessionId = String(request.sessionId || 'session_unknown');
    const userId = String(request.userId || 'user_unknown');
    const turnId = String(request.turnId || `turn_${Date.now()}`);
    const meta = request.meta || {};
    const classification = classify(request);
    const rawText = classification.text;
    const traceId = buildTraceId({ sessionId, turnId, text: rawText });

    packet.traceId = traceId;
    packet.input = { text: rawText, sessionId, userId, turnId, meta, emotion: classification.emotion };

    if (!rawText) {
      packet.ok = false;
      packet.errors.push('empty_input');
      packet.synthesis = buildFallbackAnswer({ domain: 'general', intent: 'empty' });
      return packet;
    }

    const loopSignature = hashLite(`${sessionId}|${rawText.toLowerCase()}|${classification.emotion.primaryEmotion}|${classification.emotion.nuanceProfile.archetype}`);
    const loop = phases.phase13_loopResistance ? loopGuard.check(loopSignature) : { count: 1, tripped: false };

    let domainResult = { primary: classification.domain, candidates: classification.candidates };
    if (domainRouter && typeof domainRouter.route === 'function' && phases.phase10_domainRouting) {
      try {
        const override = await domainRouter.route({
          text: rawText,
          tokens: classification.tokens,
          intent: classification.intent,
          sentiment: classification.sentiment,
          sessionId, userId, meta,
        });
        if (override && override.primary) {
          domainResult = { primary: String(override.primary), candidates: Array.isArray(override.candidates) ? override.candidates : domainResult.candidates };
        }
      } catch (error) {
        packet.errors.push(`domain_router_failed:${error.message}`);
      }
    }

    domainResult = choosePreferredDomain(domainResult, classification.emotion, meta);
    const primaryDomain = domainResult.primary;
    const responseMode = buildResponseMode({ intent: classification.intent, sentiment: classification.sentiment, domain: primaryDomain, emotion: classification.emotion });

    const knowledgeDomains = Object.keys(meta.knowledgeSections || {}).filter((k) => Array.isArray(meta.knowledgeSections[k]) && meta.knowledgeSections[k].length > 0);
    packet.routing = {
      intent: classification.intent,
      sentiment: classification.sentiment,
      domain: primaryDomain,
      candidates: domainResult.candidates,
      responseMode,
      shouldUseMarion: shouldInvokeMarion({ text: rawText, intent: classification.intent, domain: primaryDomain, sentiment: classification.sentiment, emotion: classification.emotion }),
      emotion: classification.emotion,
      knowledgeDomains,
    };

    const memoryContext = phases.phase11_memoryLift ? await getMemory({
      sessionId, userId, turnId, domain: primaryDomain, intent: classification.intent, text: rawText, meta,
    }) : null;

    const memoryHints = uniqueStrings([
      classification.emotion.primaryEmotion,
      classification.emotion.nuanceProfile.archetype,
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
        lastIntent: (memoryContext && memoryContext.lastIntent) || null,
        lastDomain: (memoryContext && memoryContext.lastDomain) || null,
        unresolved: (memoryContext && memoryContext.openLoops) || [],
      },
    };

    let evidenceRaw = [];
    if (phases.phase12_evidenceRanking) {
      evidenceRaw = await collectEvidence({
        text: rawText,
        tokens: classification.tokens,
        intent: classification.intent,
        domain: primaryDomain,
        sentiment: classification.sentiment,
        sessionId, userId, turnId, meta, memoryHints, traceId,
      });
    }

    const rankedEvidence = rankEvidence({ items: evidenceRaw, domain: primaryDomain, intent: classification.intent, memoryHints });
    packet.evidence = {
      count: rankedEvidence.length,
      top: rankedEvidence.slice(0, 5),
      sources: uniqueStrings(rankedEvidence.map(x => x.source)),
    };

    packet.guardrails.loopGuard = loop.tripped ? { active: true, count: loop.count, action: 'deepen_or_redirect' } : { active: false, count: loop.count, action: 'none' };
    packet.guardrails.emotion = {
      supportLock: !!classification.emotion.conversationPlan.shouldUseSupportLock,
      suppressMenus: !!classification.emotion.conversationPlan.shouldSuppressMenus,
      loopRisk: classification.emotion.nuanceProfile.loopRisk,
      archetype: classification.emotion.nuanceProfile.archetype,
      conversationNeed: classification.emotion.nuanceProfile.conversationNeed,
      avoidLaneRebuild: true,
      questionSuppression: !!(classification.emotion.conversationPlan.askAllowed === false || classification.emotion.nuanceProfile.questionPressure === 'low' || classification.emotion.nuanceProfile.questionPressure === 'none')
    };
    if (loop.tripped) packet.routing.responseMode.concise = true;

    let marionResult = null;
    if (packet.routing.shouldUseMarion && phases.phase16_bridgeGating && phases.phase17_marionIsolation) {
      marionResult = await invokeMarion({
        text: rawText,
        userText: rawText,
        sessionId, userId, turnId, traceId, meta,
        routing: packet.routing,
        memory: packet.memory,
        evidence: rankedEvidence,
        emotion: classification.emotion,
        loopGuard: packet.guardrails.loopGuard,
      });
      if (!marionResult && marionSO && !marionMethod) packet.errors.push('marion_method_unresolved');
    }

    packet.marion = {
      invoked: !!packet.routing.shouldUseMarion,
      available: !!marionSO,
      method: marionMethod || null,
      answered: !!(marionResult && marionResult.answer),
      emotionAware: !!classification.emotion.primaryEmotion,
      archetype: classification.emotion.nuanceProfile.archetype,
      supportLock: !!classification.emotion.conversationPlan.shouldUseSupportLock,
      marionMaySpeak: true,
      allowMenuRegeneration: false,
      knowledgeDomains: packet.routing.knowledgeDomains || []
    };

    let synthesis = null;
    try {
      if (synthesize && typeof synthesize === 'function') {
        synthesis = await synthesize({
          text: rawText,
          intent: classification.intent,
          domain: primaryDomain,
          sentiment: classification.sentiment,
          memory: packet.memory,
          evidence: rankedEvidence,
          responseMode,
          emotion: classification.emotion,
          loopGuard: packet.guardrails.loopGuard,
          traceId,
          marion: marionResult,
        });
      } else {
        synthesis = defaultSynthesize({ domain: primaryDomain, intent: classification.intent, evidence: rankedEvidence, responseMode, marionResult, emotion: classification.emotion });
      }
    } catch (error) {
      packet.errors.push(`synthesis_failed:${error.message}`);
    }

    if (!synthesis || !synthesis.answer) synthesis = buildFallbackAnswer({ domain: primaryDomain, intent: classification.intent, emotion: classification.emotion, evidenceThin: rankedEvidence.length < 2 });
    packet.synthesis = synthesis;
    packet.diagnostics = {
      confidence: Number(synthesis.confidence || 0),
      usedFallback: synthesis.mode === 'fail-open' || synthesis.nextAction === 'fallback_synthesis',
      emotionPrimary: classification.emotion.primaryEmotion || null,
      emotionArchetype: classification.emotion.nuanceProfile.archetype || null,
      supportLock: !!classification.emotion.conversationPlan.shouldUseSupportLock,
      evidenceThin: rankedEvidence.length < 2,
      traceReady: phases.phase15_traceability,
    };

    const memoryWrite = {
      sessionId, userId, turnId, traceId,
      lastIntent: classification.intent,
      lastDomain: primaryDomain,
      recentTopics: uniqueStrings([primaryDomain, classification.intent, ...classification.tokens.slice(0, 6)]).slice(0, 10),
      openLoops: synthesis.nextAction === 'clarify_or_expand' ? [rawText.slice(0, 120)] : [],
      lastConfidence: Number(synthesis.confidence || 0),
      updatedAt: safeNowISO(),
    };

    await putMemory(memoryWrite);
    await track({
      event: 'marion_bridge_resolve',
      traceId, sessionId, userId, turnId,
      intent: classification.intent,
      domain: primaryDomain,
      evidenceCount: rankedEvidence.length,
      confidence: memoryWrite.lastConfidence,
      fallback: packet.diagnostics.usedFallback,
      loopCount: loop.count,
      usedMarion: packet.marion.answered,
    });

    try {
      if (logger && typeof logger.info === 'function') {
        logger.info('[marionBridge.resolve]', {
          traceId,
          intent: classification.intent,
          domain: primaryDomain,
          evidenceCount: rankedEvidence.length,
          confidence: memoryWrite.lastConfidence,
          fallback: packet.diagnostics.usedFallback,
          usedMarion: packet.marion.answered,
        });
      }
    } catch {}

    return packet;
  }

  async function maybeResolve(request = {}) {
    const classification = classify(request);
    if (!classification.shouldUseMarion) {
      return { ok: true, usedBridge: false, reason: 'bridge_not_needed', classification, packet: null };
    }
    const packet = await resolve(request);
    return { ok: true, usedBridge: true, reason: 'bridge_resolved', classification, packet };
  }

  async function healthcheck() {
    return {
      ok: true,
      bridge: 'marionBridge.js',
      version: BRIDGE_VERSION,
      checks: {
        marionSO: !!marionSO,
        marionMethod: marionMethod || null,
        memoryProvider: !!memoryProvider,
        evidenceEngine: !!evidenceEngine,
        telemetry: !!telemetry,
        phases,
        now: safeNowISO(),
      },
    };
  }

  function resetLoop(sessionId, text = '') {
    const key = hashLite(`${sessionId}|${String(text).toLowerCase()}`);
    loopGuard.reset(key);
    return { ok: true, key };
  }

  return { classify, resolve, maybeResolve, healthcheck, resetLoop };
}

module.exports = {
  createMarionBridge,
  DEFAULT_PHASE_FLAGS,
  DEFAULT_DOMAIN_KEYWORDS,
  BRIDGE_VERSION,
};

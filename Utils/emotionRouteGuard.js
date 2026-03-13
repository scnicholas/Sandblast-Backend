'use strict';

/**
 * emotionRouteGuard.js v2.0.0
 *
 * Canonical emotional intake / scoring / routing-hint layer.
 * Purpose:
 * - detect broad and deep emotional signal
 * - normalize to stable emotional payload
 * - provide downstream routing hints without owning final response wording
 * - strengthen continuity and anti-loop readiness for stateSpine/chatEngine/supportResponse
 *
 * Downstream consumers:
 * - stateSpine.js
 * - chatEngine.js
 * - supportResponse.js
 * - sitebridge.js
 * - affectEngine.js
 * - tts.js
 */

const VERSION = 'emotionRouteGuard v2.0.0';

function safeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function uniq(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];
}

function topEntries(obj, limit = 3) {
  return Object.entries(obj || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, score]) => ({ key, score: round(score) }));
}

function round(n, places = 4) {
  const p = Math.pow(10, places);
  return Math.round(num(n, 0) * p) / p;
}

function containsPhrase(text, phrases) {
  const t = ` ${lower(text)} `;
  return (phrases || []).some((p) => t.includes(` ${lower(p)} `));
}

function countPhraseHits(text, phrases) {
  const t = lower(text);
  let hits = 0;
  for (const p of phrases || []) {
    if (!p) continue;
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = t.match(new RegExp(escaped, 'g'));
    hits += m ? m.length : 0;
  }
  return hits;
}

const EMOTION_DEFS = {
  admiration: {
    cluster: 'affiliative',
    valence: 'positive',
    phrases: ['admire', 'impressed by', 'respect deeply', 'look up to', 'amazed by them'],
    supportMode: 'affirm_and_channel',
    routeBias: 'deepen_then_channel'
  },
  adoration: {
    cluster: 'affiliative',
    valence: 'positive',
    phrases: ['adore', 'love so much', 'cherish', 'devoted to', 'deep affection'],
    supportMode: 'warm_reflection',
    routeBias: 'deepen'
  },
  aestheticAppreciation: {
    cluster: 'reflective',
    valence: 'positive',
    phrases: ['beautiful', 'stunning', 'gorgeous', 'moved by beauty', 'artistically powerful'],
    supportMode: 'reflective_depth',
    routeBias: 'deepen'
  },
  amusement: {
    cluster: 'uplift',
    valence: 'positive',
    phrases: ['funny', 'hilarious', 'that made me laugh', 'amused', 'cracking me up'],
    supportMode: 'light_mirroring',
    routeBias: 'maintain'
  },
  anger: {
    cluster: 'threat',
    valence: 'negative',
    phrases: ['angry', 'mad', 'furious', 'resentful', 'pissed off', 'hostile'],
    supportMode: 'regulate_and_redirect',
    routeBias: 'stabilize'
  },
  anxiety: {
    cluster: 'threat',
    valence: 'negative',
    phrases: ['anxious', 'worried', 'nervous', 'uneasy', 'on edge', 'spiraling'],
    supportMode: 'soothe_and_structure',
    routeBias: 'stabilize'
  },
  awe: {
    cluster: 'uplift',
    valence: 'positive',
    phrases: ['in awe', 'speechless', 'overwhelmed in a good way', 'reverent', 'mind-blown'],
    supportMode: 'reflective_depth',
    routeBias: 'deepen'
  },
  awkwardness: {
    cluster: 'uncertain',
    valence: 'mixed',
    phrases: ['awkward', 'cringe', 'uncomfortable', 'socially weird', 'that was embarrassing'],
    supportMode: 'normalize_and_reframe',
    routeBias: 'clarify'
  },
  boredom: {
    cluster: 'low_activation',
    valence: 'negative',
    phrases: ['bored', 'nothing interests me', 'unstimulated', 'flat', 'same old'],
    supportMode: 'activation_prompt',
    routeBias: 'activate'
  },
  calmness: {
    cluster: 'regulated',
    valence: 'positive',
    phrases: ['calm', 'peaceful', 'settled', 'at ease', 'grounded'],
    supportMode: 'steady_and_extend',
    routeBias: 'maintain'
  },
  confusion: {
    cluster: 'uncertain',
    valence: 'negative',
    phrases: ['confused', 'do not understand', 'lost', 'unclear', 'mixed up'],
    supportMode: 'clarify_and_sequence',
    routeBias: 'clarify'
  },
  craving: {
    cluster: 'drive',
    valence: 'mixed',
    phrases: ['craving', 'want badly', 'yearning', 'hungry for', 'aching for'],
    supportMode: 'contain_and_channel',
    routeBias: 'channel'
  },
  disgust: {
    cluster: 'aversion',
    valence: 'negative',
    phrases: ['disgusted', 'gross', 'repulsed', 'sickened', 'nauseated by'],
    supportMode: 'boundary_and_redirect',
    routeBias: 'boundary'
  },
  empatheticPain: {
    cluster: 'relational',
    valence: 'negative',
    phrases: ['hurting for them', 'my heart breaks for', 'feel their pain', 'suffering with them'],
    supportMode: 'validate_and_hold',
    routeBias: 'deepen'
  },
  entrenchment: {
    cluster: 'resistance',
    valence: 'negative',
    phrases: ['not changing my mind', 'dug in', 'standing firm', 'refuse to budge', 'locked in'],
    supportMode: 'gentle_challenge',
    routeBias: 'challenge_softly'
  },
  envy: {
    cluster: 'aversion',
    valence: 'negative',
    phrases: ['jealous', 'envious', 'wish I had that', 'why not me', 'resent their success'],
    supportMode: 'reframe_and_channel',
    routeBias: 'reframe'
  },
  excitement: {
    cluster: 'uplift',
    valence: 'positive',
    phrases: ['excited', 'pumped', 'energized', 'cannot wait', 'thrilled'],
    supportMode: 'celebrate_and_channel',
    routeBias: 'channel'
  },
  fear: {
    cluster: 'threat',
    valence: 'negative',
    phrases: ['afraid', 'scared', 'fearful', 'terrified', 'fight or flight'],
    supportMode: 'soothe_and_ground',
    routeBias: 'stabilize'
  },
  horror: {
    cluster: 'threat',
    valence: 'negative',
    phrases: ['horrified', 'appalled', 'shocked in a bad way', 'nightmarish'],
    supportMode: 'contain_and_ground',
    routeBias: 'stabilize'
  },
  interest: {
    cluster: 'curious',
    valence: 'positive',
    phrases: ['interested', 'intrigued', 'tell me more', 'curious about', 'leaning in'],
    supportMode: 'expand_and_explore',
    routeBias: 'deepen'
  },
  joy: {
    cluster: 'uplift',
    valence: 'positive',
    phrases: ['joy', 'joyful', 'happy', 'delighted', 'glad', 'elated'],
    supportMode: 'celebrate_and_anchor',
    routeBias: 'maintain'
  },
  nostalgia: {
    cluster: 'reflective',
    valence: 'mixed',
    phrases: ['nostalgic', 'miss those days', 'takes me back', 'remember when', 'bittersweet memory'],
    supportMode: 'reflect_and_mean',
    routeBias: 'deepen'
  },
  relief: {
    cluster: 'regulated',
    valence: 'positive',
    phrases: ['relieved', 'what a relief', 'weight off my shoulders', 'finally over'],
    supportMode: 'stabilize_and_anchor',
    routeBias: 'maintain'
  },
  romance: {
    cluster: 'affiliative',
    valence: 'positive',
    phrases: ['romantic', 'falling for', 'in love', 'tender', 'drawn to them'],
    supportMode: 'warm_reflection',
    routeBias: 'deepen'
  },
  sadness: {
    cluster: 'distress',
    valence: 'negative',
    phrases: ['sad', 'down', 'heartbroken', 'grief', 'hopeless', 'disappointed'],
    supportMode: 'validate_and_soothe',
    routeBias: 'stabilize'
  },
  satisfaction: {
    cluster: 'regulated',
    valence: 'positive',
    phrases: ['satisfied', 'content', 'pleased', 'that feels right', 'fulfilled'],
    supportMode: 'anchor_and_extend',
    routeBias: 'maintain'
  },
  sexualDesire: {
    cluster: 'drive',
    valence: 'mixed',
    phrases: ['desire', 'turned on', 'aroused', 'lust', 'sexual tension'],
    supportMode: 'contain_and_channel',
    routeBias: 'boundary'
  },
  surprise: {
    cluster: 'uncertain',
    valence: 'mixed',
    phrases: ['surprised', 'unexpected', 'did not see that coming', 'caught off guard'],
    supportMode: 'orient_and_clarify',
    routeBias: 'clarify'
  },
  empathy: {
    cluster: 'relational',
    valence: 'positive',
    phrases: ['I understand how they feel', 'empathize', 'feel with them', 'compassion for'],
    supportMode: 'attune_and_extend',
    routeBias: 'deepen'
  },
  triumph: {
    cluster: 'uplift',
    valence: 'positive',
    phrases: ['triumph', 'victory', 'I did it', 'overcame it', 'won'],
    supportMode: 'celebrate_and_channel',
    routeBias: 'channel'
  },
  guilt: {
    cluster: 'self_evaluative',
    valence: 'negative',
    phrases: ['guilty', 'my fault', 'I should not have', 'regret what I did'],
    supportMode: 'repair_and_reframe',
    routeBias: 'repair'
  },
  pride: {
    cluster: 'uplift',
    valence: 'positive',
    phrases: ['proud', 'earned this', 'worked hard for this', 'I am proud of myself'],
    supportMode: 'affirm_and_anchor',
    routeBias: 'maintain'
  },
  hope: {
    cluster: 'uplift',
    valence: 'positive',
    phrases: ['hopeful', 'maybe this can work', 'there is still a chance', 'optimistic'],
    supportMode: 'reinforce_and_channel',
    routeBias: 'channel'
  },
  shame: {
    cluster: 'self_evaluative',
    valence: 'negative',
    phrases: ['ashamed', 'humiliated', 'I am embarrassed by myself', 'I feel small'],
    supportMode: 'repair_and_soothe',
    routeBias: 'repair'
  },
  disappointment: {
    cluster: 'distress',
    valence: 'negative',
    phrases: ['disappointed', 'let down', 'that hurt', 'it was not what I hoped'],
    supportMode: 'validate_and_reframe',
    routeBias: 'stabilize'
  },
  frustration: {
    cluster: 'resistance',
    valence: 'negative',
    phrases: ['frustrated', 'fed up', 'annoyed', 'this is exhausting', 'stuck again'],
    supportMode: 'regulate_and_unblock',
    routeBias: 'clarify'
  },
  curiosity: {
    cluster: 'curious',
    valence: 'positive',
    phrases: ['curious', 'wondering', 'want to understand', 'explore this', 'interested in why'],
    supportMode: 'expand_and_explore',
    routeBias: 'deepen'
  },
  trust: {
    cluster: 'affiliative',
    valence: 'positive',
    phrases: ['trust', 'I believe in', 'feel safe with', 'depend on'],
    supportMode: 'steady_and_extend',
    routeBias: 'maintain'
  },
  anticipation: {
    cluster: 'drive',
    valence: 'positive',
    phrases: ['looking forward to', 'anticipating', 'waiting for', 'counting down'],
    supportMode: 'channel_forward',
    routeBias: 'channel'
  },
  helplessness: {
    cluster: 'distress',
    valence: 'negative',
    phrases: ['helpless', 'cannot do anything', 'powerless', 'do not know what to do anymore'],
    supportMode: 'stabilize_then_shrink_scope',
    routeBias: 'stabilize'
  },
  loneliness: {
    cluster: 'distress',
    valence: 'negative',
    phrases: ['lonely', 'alone', 'isolated', 'nobody gets me', 'by myself in this'],
    supportMode: 'attune_and_connect',
    routeBias: 'deepen'
  },
  determination: {
    cluster: 'drive',
    valence: 'positive',
    phrases: ['determined', 'I will keep going', 'locked in to finish', 'committed'],
    supportMode: 'channel_forward',
    routeBias: 'channel'
  }
};

const INTENSIFIERS = ['very', 'really', 'so', 'extremely', 'deeply', 'incredibly', 'massively', 'seriously'];
const REGULATION_PHRASES = ['take a breath', 'calm down', 'steady', 'one step at a time', 'ground myself'];
const RECOVERY_PHRASES = ['feeling better', 'coming back', 'recovering', 'getting through it', 'turning a corner'];
const CONTRADICTION_PAIRS = [
  ['joy', 'sadness'],
  ['calmness', 'anxiety'],
  ['hope', 'helplessness'],
  ['trust', 'fear'],
  ['pride', 'shame'],
  ['relief', 'horror']
];

function basePayload() {
  return {
    ok: true,
    source: 'emotionRouteGuard',
    version: VERSION,
    createdAt: Date.now(),
    input: {
      textLength: 0,
      hasPriorState: false
    },
    primaryEmotion: null,
    secondaryEmotion: null,
    emotionCluster: 'unknown',
    valence: 'mixed',
    intensity: 0,
    confidence: 0,
    emotionalVolatility: 'stable',
    supportModeCandidate: 'clarify_and_sequence',
    routeBias: 'clarify',
    fallbackSuppression: false,
    needsNovelMove: false,
    routeExhaustion: false,
    scores: {},
    rankedEmotions: [],
    continuity: {},
    routeHints: [],
    supportFlags: {},
    contradictions: [],
    recoverySignals: [],
    regulationSignals: [],
    downstream: {}
  };
}

function analyzeEmotionText(text) {
  const scores = {};
  const t = lower(text);

  for (const [emotion, def] of Object.entries(EMOTION_DEFS)) {
    let score = 0;
    score += countPhraseHits(t, def.phrases) * 1.15;
    if (containsPhrase(t, def.phrases)) score += 0.8;

    if (INTENSIFIERS.some((w) => t.includes(` ${w} `)) && containsPhrase(t, def.phrases)) {
      score += 0.35;
    }

    if (score > 0) scores[emotion] = round(score);
  }

  return scores;
}

function deriveDominance(scores) {
  const ranked = topEntries(scores, 5);
  const primary = ranked[0]?.key || null;
  const secondary = ranked[1]?.key || null;
  const topScore = ranked[0]?.score || 0;
  const secondScore = ranked[1]?.score || 0;
  const confidence = topScore <= 0 ? 0 : round(clamp((topScore - (secondScore * 0.35)) / (topScore + 0.5), 0, 1));
  return { ranked, primary, secondary, confidence };
}

function deriveValence(primary) {
  const def = EMOTION_DEFS[primary];
  return def?.valence || 'mixed';
}

function deriveIntensity(scores, text) {
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const base = clamp(total / 6, 0, 1);
  const exclam = (safeStr(text).match(/!/g) || []).length;
  const capsBoost = /[A-Z]{4,}/.test(safeStr(text)) ? 0.12 : 0;
  return round(clamp(base + (exclam * 0.03) + capsBoost, 0, 1));
}

function deriveVolatility(primary, secondary, intensity) {
  const mixedClusters = new Set(['uncertain', 'distress', 'threat', 'resistance']);
  if (intensity >= 0.8 && primary && secondary) return 'high';
  if (intensity >= 0.65 && mixedClusters.has(EMOTION_DEFS[primary]?.cluster || '')) return 'elevated';
  if (intensity >= 0.35) return 'moderate';
  return 'stable';
}

function deriveSupportMode(primary, intensity) {
  const def = EMOTION_DEFS[primary];
  let mode = def?.supportMode || 'clarify_and_sequence';
  if (intensity >= 0.85 && ['deepen', 'channel'].includes(def?.routeBias)) {
    mode = 'stabilize_then_' + mode;
  }
  return mode;
}

function deriveRouteBias(primary, secondary, intensity) {
  const p = EMOTION_DEFS[primary]?.routeBias || 'clarify';
  const s = EMOTION_DEFS[secondary]?.routeBias || null;
  if (intensity >= 0.8 && ['channel', 'deepen'].includes(p)) return 'stabilize_then_' + p;
  if (s && s !== p && intensity >= 0.55) return `${p}_with_${s}`;
  return p;
}

function deriveContradictions(scores) {
  const hits = [];
  for (const [a, b] of CONTRADICTION_PAIRS) {
    if ((scores[a] || 0) > 0 && (scores[b] || 0) > 0) hits.push(`${a}<->${b}`);
  }
  return hits;
}

function deriveRecoverySignals(text) {
  return RECOVERY_PHRASES.filter((p) => lower(text).includes(lower(p)));
}

function deriveRegulationSignals(text) {
  return REGULATION_PHRASES.filter((p) => lower(text).includes(lower(p)));
}

function deriveSupportFlags(payload, text) {
  const body = lower(text);
  const isThreat = ['threat', 'distress', 'self_evaluative'].includes(payload.emotionCluster);
  const isStuck = /stuck|again|same thing|loop|repeating|back to the same/i.test(safeStr(text));
  return {
    needsStabilization: payload.intensity >= 0.65 || isThreat,
    needsClarification: ['uncertain', 'resistance'].includes(payload.emotionCluster),
    needsContainment: ['aversion', 'threat'].includes(payload.emotionCluster),
    needsConnection: ['relational', 'distress', 'affiliative'].includes(payload.emotionCluster),
    needsForwardMotion: ['drive', 'uplift', 'low_activation'].includes(payload.emotionCluster) || isStuck,
    mentionsLooping: /loop|looping|again and again|same response|back to the same/i.test(body)
  };
}

function deriveRouteHints(payload) {
  const hints = [];
  const c = payload.emotionCluster;
  const i = payload.intensity;
  if (c === 'threat' || c === 'distress') hints.push('psych_support_bridge', 'state_spine_stabilize');
  if (c === 'uncertain') hints.push('clarity_structuring_bridge');
  if (c === 'resistance') hints.push('gentle_challenge_bridge');
  if (c === 'curious' || c === 'reflective') hints.push('reflective_depth_bridge');
  if (c === 'uplift' || c === 'drive') hints.push('momentum_building');
  if (c === 'affiliative' || c === 'relational') hints.push('connection_preserve');
  if (c === 'aversion') hints.push('boundary_mode');
  if (i >= 0.7) hints.push('fallback_suppression');
  return uniq(hints);
}

function deriveContinuity(payload, priorState = {}) {
  const prevPrimary = safeStr(priorState.primaryEmotion || priorState.dominantEmotion || '');
  const prevSupport = safeStr(priorState.supportModeCandidate || priorState.lastSupportMode || '');
  const prevNoProgress = num(priorState.noProgressTurnCount, 0);
  const prevSameEmotion = num(priorState.sameEmotionCount, 0);
  const prevSameSupport = num(priorState.sameSupportModeCount, 0);
  const prevFallback = num(priorState.repeatedFallbackCount, 0);

  const sameEmotion = prevPrimary && prevPrimary === payload.primaryEmotion;
  const sameSupport = prevSupport && prevSupport === payload.supportModeCandidate;

  const sameEmotionCount = sameEmotion ? prevSameEmotion + 1 : 0;
  const sameSupportModeCount = sameSupport ? prevSameSupport + 1 : 0;
  const noProgressTurnCount = (sameEmotion && sameSupport) ? prevNoProgress + 1 : 0;
  const repeatedFallbackCount = num(priorState.repeatedFallbackCount, 0);

  const routeExhaustion = sameEmotionCount >= 2 && sameSupportModeCount >= 2 && noProgressTurnCount >= 2;
  const fallbackSuppression = payload.intensity >= 0.65 || routeExhaustion || repeatedFallbackCount >= 1;
  const needsNovelMove = routeExhaustion || noProgressTurnCount >= 2 || repeatedFallbackCount >= 2;

  return {
    previousPrimaryEmotion: prevPrimary || null,
    previousSupportMode: prevSupport || null,
    stateShift: prevPrimary && payload.primaryEmotion && prevPrimary !== payload.primaryEmotion ? 'shifted' : 'stable_or_unknown',
    sameEmotionCount,
    sameSupportModeCount,
    noProgressTurnCount,
    repeatedFallbackCount,
    routeExhaustion,
    fallbackSuppression,
    needsNovelMove
  };
}

function deriveDownstream(payload) {
  return {
    stateSpine: {
      emotionKey: payload.primaryEmotion,
      emotionCluster: payload.emotionCluster,
      continuity: payload.continuity,
      volatility: payload.emotionalVolatility
    },
    chatEngine: {
      routeBias: payload.routeBias,
      fallbackSuppression: payload.fallbackSuppression,
      needsNovelMove: payload.needsNovelMove,
      routeHints: payload.routeHints
    },
    supportResponse: {
      supportModeCandidate: payload.supportModeCandidate,
      primaryEmotion: payload.primaryEmotion,
      secondaryEmotion: payload.secondaryEmotion,
      intensity: payload.intensity,
      confidence: payload.confidence
    },
    sitebridge: {
      summary: `${payload.primaryEmotion || 'unknown'} / ${payload.emotionCluster} / ${payload.routeBias}`,
      confidence: payload.confidence
    },
    affectEngine: {
      tone: payload.valence === 'negative' ? 'gentle_regulated' : 'warm_attuned',
      volatility: payload.emotionalVolatility,
      intensity: payload.intensity
    },
    tts: {
      prosodyBias: payload.valence === 'negative' ? 'slower_steadier' : 'natural_warm',
      caution: payload.intensity >= 0.8
    }
  };
}

function analyzeEmotionRoute(input = {}, priorState = {}) {
  const payload = basePayload();
  const text = safeStr(input.text || input.message || input.userText || '');
  payload.input.textLength = text.length;
  payload.input.hasPriorState = !!priorState && Object.keys(priorState || {}).length > 0;

  const scores = analyzeEmotionText(text);
  payload.scores = Object.fromEntries(
    Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v)])
  );

  const { ranked, primary, secondary, confidence } = deriveDominance(scores);
  payload.rankedEmotions = ranked;
  payload.primaryEmotion = primary;
  payload.secondaryEmotion = secondary;
  payload.emotionCluster = primary ? (EMOTION_DEFS[primary]?.cluster || 'unknown') : 'unknown';
  payload.valence = deriveValence(primary);
  payload.intensity = deriveIntensity(scores, text);
  payload.confidence = confidence;
  payload.emotionalVolatility = deriveVolatility(primary, secondary, payload.intensity);
  payload.supportModeCandidate = deriveSupportMode(primary, payload.intensity);
  payload.routeBias = deriveRouteBias(primary, secondary, payload.intensity);
  payload.contradictions = deriveContradictions(scores);
  payload.recoverySignals = deriveRecoverySignals(text);
  payload.regulationSignals = deriveRegulationSignals(text);

  payload.continuity = deriveContinuity(payload, priorState);
  payload.fallbackSuppression = !!payload.continuity.fallbackSuppression;
  payload.needsNovelMove = !!payload.continuity.needsNovelMove;
  payload.routeExhaustion = !!payload.continuity.routeExhaustion;

  payload.supportFlags = deriveSupportFlags(payload, text);
  payload.routeHints = deriveRouteHints(payload);
  payload.downstream = deriveDownstream(payload);

  return payload;
}

const emotionRouteGuard = {
  version: VERSION,
  defs: EMOTION_DEFS,
  analyzeEmotionRoute
};

module.exports = {
  VERSION,
  EMOTION_DEFS,
  analyzeEmotionRoute,
  emotionRouteGuard
};

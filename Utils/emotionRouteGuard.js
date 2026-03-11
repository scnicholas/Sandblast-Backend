'use strict';

/**
 * EmotionRootGod.js
 * ------------------------------------------------------------
 * Root emotional-intelligence spine for Nyx / Marion / SiteBridge.
 *
 * PURPOSE
 * - Detect emotional signals from user text.
 * - Score both negative and positive emotional markers.
 * - Surface high-priority distress / risk cues.
 * - Surface positive reinforcement / resilience / momentum cues.
 * - Produce structured emotional state output for downstream systems:
 *   - chatEngine.js
 *   - affectEngine.js
 *   - stateSpine.js
 *   - sitebridge.js
 *   - tts.js
 *
 * DESIGN GOALS
 * - Lightweight and payload-safe
 * - Deterministic first, extensible second
 * - No external dependency required
 * - Fail-open safe
 * - Good for conversational orchestration, not clinical diagnosis
 *
 * 15 PHASE ALIGNMENT
 * ------------------------------------------------------------
 * Phase 01: Emotional signal ingestion
 * Phase 02: Distress marker detection
 * Phase 03: Positive reinforcement marker detection
 * Phase 04: Valence scoring
 * Phase 05: Intensity scoring
 * Phase 06: Momentum / directional shift detection
 * Phase 07: Emotional contradiction detection
 * Phase 08: Recovery / resilience signal detection
 * Phase 09: Reinforcement opportunity selection
 * Phase 10: Continuity memory hooks
 * Phase 11: Response tone recommendation
 * Phase 12: Escalation / support guardrails
 * Phase 13: Routing hints for Nyx / Marion / domain bridge
 * Phase 14: User-state summary object generation
 * Phase 15: Safe fallback / fail-open integrity
 */

const DEFAULT_CONFIG = {
  version: '1.0.0',
  maxTextLength: 12000,
  contradictionWindow: 2,
  intensityCap: 1,
  enableMomentum: true,
  enableContradictions: true,
  enableRiskSignals: true,
  enablePositiveReinforcement: true,
  enableRecoverySignals: true,
  debug: false
};

/**
 * Core lexicon:
 * - weights are relative importance multipliers
 * - category helps routing and response shaping
 * - patterns are regex-safe strings
 */
const LEXICON = {
  negative: {
    sadness: {
      weight: 0.78,
      patterns: [
        'sad',
        'down',
        'depressed',
        'depressing',
        'hopeless',
        'empty',
        'numb',
        'broken',
        'miserable',
        'grief',
        'grieving',
        'heartbroken',
        'hurt inside',
        'i feel nothing',
        'can\\'?t feel anything',
        'i am exhausted emotionally'
      ]
    },
    anxiety: {
      weight: 0.82,
      patterns: [
        'anxious',
        'anxiety',
        'panic',
        'panicking',
        'overwhelmed',
        'stressed',
        'pressure',
        'can\\'?t calm down',
        'racing thoughts',
        'my mind won\\'?t stop',
        'i can\\'?t breathe',
        'worried sick',
        'on edge',
        'shaking',
        'uneasy',
        'terrified',
        'fearful'
      ]
    },
    anger: {
      weight: 0.74,
      patterns: [
        'angry',
        'furious',
        'rage',
        'pissed',
        'frustrated',
        'irritated',
        'mad',
        'fed up',
        'done with this',
        'i hate this',
        'i hate them',
        'annoyed',
        'resentful',
        'bitter'
      ]
    },
    shame: {
      weight: 0.86,
      patterns: [
        'ashamed',
        'embarrassed',
        'humiliated',
        'i am a failure',
        'i feel like a failure',
        'worthless',
        'pathetic',
        'disgusted with myself',
        'i messed everything up',
        'i ruin everything',
        'i hate myself',
        'not good enough'
      ]
    },
    loneliness: {
      weight: 0.80,
      patterns: [
        'alone',
        'lonely',
        'isolated',
        'nobody cares',
        'no one cares',
        'by myself',
        'i have no one',
        'nobody understands',
        'no one understands',
        'forgotten',
        'invisible'
      ]
    },
    exhaustion: {
      weight: 0.70,
      patterns: [
        'tired',
        'drained',
        'burned out',
        'burnt out',
        'exhausted',
        'fatigued',
        'worn out',
        'running on empty',
        'can\\'?t keep going',
        'i am done',
        'spent'
      ]
    },
    confusion: {
      weight: 0.66,
      patterns: [
        'confused',
        'lost',
        'disoriented',
        'don\\'?t know what to do',
        'don\\'?t know anymore',
        'stuck',
        'spiraling',
        'all over the place',
        'nothing makes sense'
      ]
    },
    despair: {
      weight: 0.93,
      patterns: [
        'hopeless',
        'there is no point',
        'what\\'?s the point',
        'i can\\'?t do this anymore',
        'nothing will get better',
        'i give up',
        'done living like this',
        'i am done trying'
      ]
    }
  },

  risk: {
    selfHarmHigh: {
      weight: 1.0,
      patterns: [
        'kill myself',
        'end my life',
        'suicide',
        'i want to die',
        'i should die',
        'i don\\'?t want to live',
        'hurt myself',
        'self harm',
        'cut myself',
        'i am going to end it',
        'i won\\'?t be here tomorrow'
      ]
    },
    selfHarmPassive: {
      weight: 0.95,
      patterns: [
        'wish i could disappear',
        'wish i was gone',
        'better off without me',
        'people would be better off without me',
        'i don\\'?t want to exist',
        'i want everything to stop',
        'i wish i wouldn\\'?t wake up'
      ]
    },
    crisisDistress: {
      weight: 0.92,
      patterns: [
        'breaking down',
        'falling apart',
        'losing my mind',
        'can\\'?t take this',
        'can\\'?t keep myself safe',
        'completely losing control',
        'i might do something bad'
      ]
    }
  },

  positive: {
    hope: {
      weight: 0.82,
      patterns: [
        'hopeful',
        'there is hope',
        'things can get better',
        'i believe it will work',
        'i think i can do this',
        'getting better',
        'moving forward',
        'i see a path',
        'optimistic'
      ]
    },
    gratitude: {
      weight: 0.72,
      patterns: [
        'grateful',
        'thankful',
        'appreciate it',
        'i appreciate that',
        'that helps',
        'that means a lot',
        'glad',
        'relieved',
        'blessed'
      ]
    },
    confidence: {
      weight: 0.85,
      patterns: [
        'confident',
        'i got this',
        'i can handle it',
        'i can do this',
        'locked in',
        'ready',
        'strong',
        'capable',
        'focused',
        'determined',
        'dialed in'
      ]
    },
    pride: {
      weight: 0.70,
      patterns: [
        'proud',
        'i did it',
        'i pulled it off',
        'that was a win',
        'i made progress',
        'i am improving',
        'i earned that',
        'that went well'
      ]
    },
    joy: {
      weight: 0.77,
      patterns: [
        'happy',
        'excited',
        'joy',
        'joyful',
        'energized',
        'feeling great',
        'feeling amazing',
        'love this',
        'this is awesome',
        'this feels good',
        'light',
        'peaceful'
      ]
    },
    connection: {
      weight: 0.74,
      patterns: [
        'supported',
        'heard',
        'understood',
        'connected',
        'not alone',
        'someone cares',
        'that made me feel seen',
        'i feel supported'
      ]
    },
    resilience: {
      weight: 0.88,
      patterns: [
        'still fighting',
        'i am trying',
        'i am working on it',
        'one step at a time',
        'getting back up',
        'not giving up',
        'pushing through',
        'staying consistent',
        'holding on',
        'i survived it',
        'i made it through'
      ]
    },
    momentum: {
      weight: 0.81,
      patterns: [
        'making moves',
        'making progress',
        'building',
        'leveling up',
        'improving',
        'growing',
        'advancing',
        'upgrading',
        'on the right track',
        'moving again'
      ]
    }
  },

  recovery: {
    repair: {
      weight: 0.82,
      patterns: [
        'i feel a bit better',
        'calmer now',
        'coming back to center',
        'more stable',
        'settling down',
        'it passed',
        'i got through it',
        'recovering',
        'regulating'
      ]
    },
    coping: {
      weight: 0.80,
      patterns: [
        'taking a breath',
        'breathing through it',
        'grounding myself',
        'i reached out',
        'i asked for help',
        'i went for a walk',
        'i am resting',
        'i journaled',
        'i prayed',
        'i trained',
        'i worked out',
        'i took a break'
      ]
    }
  },

  amplifiers: [
    'very',
    'really',
    'extremely',
    'so',
    'deeply',
    'super',
    'intensely',
    'seriously',
    'massively',
    'heavily'
  ],

  dampeners: [
    'slightly',
    'a bit',
    'kind of',
    'sort of',
    'somewhat',
    'a little'
  ],

  negators: [
    'not',
    'never',
    'no',
    'hardly',
    'rarely',
    'isn\\'?t',
    'aren\\'?t',
    'wasn\\'?t',
    'don\\'?t',
    'doesn\\'?t',
    'didn\\'?t',
    'can\\'?t'
  ],

  directionalUp: [
    'better',
    'improving',
    'stronger',
    'calmer',
    'more hopeful',
    'recovering',
    'coming back',
    'stabilizing',
    'less anxious',
    'less sad'
  ],

  directionalDown: [
    'worse',
    'spiraling',
    'falling apart',
    'heavier',
    'more anxious',
    'more depressed',
    'more hopeless',
    'breaking',
    'collapsing',
    'drowning'
  ]
};

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round(n, places = 4) {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

function normalizeText(input, maxLen) {
  return String(input || '')
    .slice(0, maxLen)
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function buildRegex(pattern) {
  return new RegExp(`\\b${pattern}\\b`, 'gi');
}

function countMatches(text, patterns) {
  const hits = [];
  for (const pattern of patterns) {
    const rx = buildRegex(pattern);
    let match;
    while ((match = rx.exec(text)) !== null) {
      hits.push({
        pattern,
        index: match.index,
        match: match[0]
      });
    }
  }
  return hits;
}

function hasNearbyToken(tokens, tokenIndex, vocabulary, distance = 3) {
  const start = Math.max(0, tokenIndex - distance);
  const end = Math.min(tokens.length - 1, tokenIndex + distance);
  for (let i = start; i <= end; i++) {
    if (vocabulary.includes(tokens[i])) return true;
  }
  return false;
}

function extractLocalIntensity(tokens, rawMatch) {
  const cleanMatch = String(rawMatch || '').toLowerCase();
  const firstWord = cleanMatch.split(/\s+/)[0];
  const idx = tokens.indexOf(firstWord);
  if (idx < 0) return 1;

  let mult = 1;

  if (hasNearbyToken(tokens, idx, LEXICON.amplifiers, 2)) mult += 0.22;
  if (hasNearbyToken(tokens, idx, LEXICON.dampeners, 2)) mult -= 0.16;
  if (hasNearbyToken(tokens, idx, LEXICON.negators, 2)) mult -= 0.45;

  return clamp(mult, 0, 1.45);
}

function analyzeBucket(text, bucketObj, bucketName) {
  const tokens = tokenize(text);
  const categories = [];
  let score = 0;
  let weightedHits = 0;
  const matches = [];

  for (const [category, meta] of Object.entries(bucketObj)) {
    const hits = countMatches(text.toLowerCase(), meta.patterns);
    if (!hits.length) continue;

    let categoryScore = 0;
    const categoryMatches = [];

    for (const hit of hits) {
      const localIntensity = extractLocalIntensity(tokens, hit.match);
      const hitScore = clamp(meta.weight * localIntensity, 0, 1.45);

      categoryScore += hitScore;
      weightedHits += 1;
      matches.push({
        bucket: bucketName,
        category,
        weight: meta.weight,
        localIntensity: round(localIntensity),
        hit: hit.match,
        pattern: hit.pattern,
        index: hit.index,
        score: round(hitScore)
      });

      categoryMatches.push(hit.match);
    }

    categories.push({
      category,
      matches: [...new Set(categoryMatches)],
      rawCount: hits.length,
      score: round(categoryScore)
    });

    score += categoryScore;
  }

  return {
    bucket: bucketName,
    score: round(score),
    hitCount: matches.length,
    weightedHits,
    categories,
    matches
  };
}

function detectMomentum(text) {
  const lower = text.toLowerCase();
  const upHits = countMatches(lower, LEXICON.directionalUp);
  const downHits = countMatches(lower, LEXICON.directionalDown);

  let direction = 'flat';
  if (upHits.length > downHits.length) direction = 'up';
  else if (downHits.length > upHits.length) direction = 'down';
  else if (upHits.length && downHits.length) direction = 'mixed';

  return {
    direction,
    upCount: upHits.length,
    downCount: downHits.length,
    score: round(clamp((upHits.length - downHits.length) / 5, -1, 1)),
    markers: {
      up: upHits.map(h => h.match),
      down: downHits.map(h => h.match)
    }
  };
}

function detectContradictions(text) {
  const sentences = splitSentences(text.toLowerCase());
  const contradictions = [];

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const neg = analyzeBucket(s, LEXICON.negative, 'negative');
    const pos = analyzeBucket(s, LEXICON.positive, 'positive');

    if (neg.score > 0.7 && pos.score > 0.7) {
      contradictions.push({
        sentence: s,
        type: 'same_sentence_mixed_valence',
        negativeScore: neg.score,
        positiveScore: pos.score
      });
    }

    const next = sentences[i + 1];
    if (next) {
      const neg2 = analyzeBucket(next, LEXICON.negative, 'negative');
      const pos2 = analyzeBucket(next, LEXICON.positive, 'positive');

      if (neg.score > 0.7 && pos2.score > 0.7) {
        contradictions.push({
          sentencePair: [s, next],
          type: 'negative_then_positive_shift',
          negativeScore: neg.score,
          positiveScore: pos2.score
        });
      }

      if (pos.score > 0.7 && neg2.score > 0.7) {
        contradictions.push({
          sentencePair: [s, next],
          type: 'positive_then_negative_shift',
          positiveScore: pos.score,
          negativeScore: neg2.score
        });
      }
    }
  }

  return {
    count: contradictions.length,
    contradictions
  };
}

function deriveValence(negativeScore, positiveScore, riskScore) {
  if (riskScore >= 0.95) return 'critical_negative';
  if (negativeScore === 0 && positiveScore === 0) return 'neutral';
  if (negativeScore > positiveScore * 1.4) return 'negative';
  if (positiveScore > negativeScore * 1.4) return 'positive';
  return 'mixed';
}

function deriveIntensity({ negativeScore, positiveScore, riskScore, recoveryScore }) {
  const raw = Math.max(negativeScore, positiveScore, riskScore, recoveryScore);
  if (raw >= 2.4) return 'very_high';
  if (raw >= 1.45) return 'high';
  if (raw >= 0.75) return 'moderate';
  if (raw > 0) return 'low';
  return 'flat';
}

function derivePriority({ riskScore, negativeScore, positiveScore, contradictions }) {
  if (riskScore >= 0.95) return 'critical';
  if (riskScore >= 0.65 || negativeScore >= 1.7) return 'high';
  if (contradictions.count >= 2) return 'high';
  if (negativeScore >= 0.8 || positiveScore >= 1.2) return 'medium';
  return 'normal';
}

function deriveDominantEmotion(negative, positive, recovery, risk) {
  const all = [
    ...negative.categories.map(c => ({ source: 'negative', category: c.category, score: c.score })),
    ...positive.categories.map(c => ({ source: 'positive', category: c.category, score: c.score })),
    ...recovery.categories.map(c => ({ source: 'recovery', category: c.category, score: c.score })),
    ...risk.categories.map(c => ({ source: 'risk', category: c.category, score: c.score }))
  ].sort((a, b) => b.score - a.score);

  return all[0] || { source: 'none', category: 'neutral', score: 0 };
}

function deriveReinforcementMode({ valence, positiveScore, recoveryScore, momentum, negativeScore }) {
  if (valence === 'critical_negative') return 'stabilize_and_support';
  if (negativeScore > positiveScore && recoveryScore > 0.5) return 'affirm_recovery';
  if (momentum.direction === 'up' && positiveScore > 0.75) return 'amplify_progress';
  if (valence === 'positive') return 'reinforce_strength';
  if (valence === 'mixed') return 'validate_then_anchor';
  if (valence === 'negative') return 'ground_then_support';
  return 'neutral_presence';
}

function deriveTone({ valence, intensity, priority, contradictions }) {
  if (priority === 'critical') return 'calm_grounded_supportive';
  if (valence === 'negative' && intensity === 'very_high') return 'soft_direct_stabilizing';
  if (valence === 'negative') return 'warm_validating';
  if (valence === 'mixed' || contradictions.count > 0) return 'careful_balanced_reflective';
  if (valence === 'positive' && intensity === 'high') return 'confident_reinforcing';
  if (valence === 'positive') return 'warm_reinforcing';
  return 'steady_neutral';
}

function deriveRouteHints({ riskScore, dominantEmotion, valence, positiveScore, negativeScore }) {
  const hints = [];

  if (riskScore >= 0.95) {
    hints.push('crisis_support_guardrail');
    hints.push('high_empathy_response');
    hints.push('avoid_overly_long_output');
    return hints;
  }

  if (dominantEmotion.category === 'anxiety') hints.push('psych_regulation_bridge');
  if (dominantEmotion.category === 'sadness' || dominantEmotion.category === 'despair') hints.push('psych_support_bridge');
  if (dominantEmotion.category === 'confusion') hints.push('clarity_structuring_bridge');
  if (dominantEmotion.category === 'anger') hints.push('deescalation_bridge');
  if (positiveScore > 1.0) hints.push('positive_reinforcement_engine');
  if (negativeScore > 1.0 && valence !== 'critical_negative') hints.push('validation_then_guidance');
  if (valence === 'positive') hints.push('momentum_building');
  if (dominantEmotion.category === 'confidence' || dominantEmotion.category === 'momentum') hints.push('achievement_scaling');

  return hints;
}

function deriveRecoverySignals(positive, recovery, momentum) {
  const signals = [];

  if (recovery.score > 0) signals.push('active_recovery_present');
  if (positive.categories.some(c => c.category === 'resilience')) signals.push('resilience_present');
  if (positive.categories.some(c => c.category === 'confidence')) signals.push('confidence_present');
  if (positive.categories.some(c => c.category === 'hope')) signals.push('hope_present');
  if (momentum.direction === 'up') signals.push('upward_shift_detected');

  return signals;
}

function deriveSupportFlags(risk, negative, recovery) {
  return {
    crisis: risk.score >= 0.95,
    highDistress: negative.score >= 1.7,
    needsGentlePacing: negative.score >= 0.9 || risk.score >= 0.65,
    avoidCelebratoryTone: negative.score > positiveScoreProxy(negative.score, recovery.score),
    recoveryPresent: recovery.score > 0
  };
}

function positiveScoreProxy(negativeScore, recoveryScore) {
  return negativeScore - (recoveryScore * 0.4);
}

function uniqueStrings(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

class EmotionRootGod {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.version = this.config.version;
    this.memory = {
      lastSummary: null,
      lastValence: 'neutral',
      lastIntensity: 'flat',
      lastDominantEmotion: 'neutral',
      lastTimestamp: 0
    };
  }

  analyze(input, options = {}) {
    const cfg = { ...this.config, ...options };
    const rawText = normalizeText(input, cfg.maxTextLength);

    if (!rawText) {
      return this._emptyResult('empty_input');
    }

    try {
      // Phase 01 / 02 / 03
      const negative = analyzeBucket(rawText, LEXICON.negative, 'negative');
      const positive = analyzeBucket(rawText, LEXICON.positive, 'positive');
      const recovery = analyzeBucket(rawText, LEXICON.recovery, 'recovery');
      const risk = analyzeBucket(rawText, LEXICON.risk, 'risk');

      // Phase 04 / 05
      const negativeScore = round(negative.score);
      const positiveScore = round(positive.score);
      const recoveryScore = round(recovery.score);
      const riskScore = round(risk.score);

      const valence = deriveValence(negativeScore, positiveScore, riskScore);
      const intensity = deriveIntensity({ negativeScore, positiveScore, riskScore, recoveryScore });

      // Phase 06
      const momentum = cfg.enableMomentum ? detectMomentum(rawText) : {
        direction: 'flat',
        upCount: 0,
        downCount: 0,
        score: 0,
        markers: { up: [], down: [] }
      };

      // Phase 07
      const contradictions = cfg.enableContradictions
        ? detectContradictions(rawText)
        : { count: 0, contradictions: [] };

      // Phase 08
      const recoverySignals = deriveRecoverySignals(positive, recovery, momentum);

      // Phase 09
      const reinforcementMode = deriveReinforcementMode({
        valence,
        positiveScore,
        recoveryScore,
        momentum,
        negativeScore
      });

      // Phase 10
      const continuity = this._deriveContinuity({
        valence,
        intensity,
        dominantEmotion: deriveDominantEmotion(negative, positive, recovery, risk).category
      });

      // Phase 11
      const priority = derivePriority({
        riskScore,
        negativeScore,
        positiveScore,
        contradictions
      });

      const tone = deriveTone({
        valence,
        intensity,
        priority,
        contradictions
      });

      // Phase 12 / 13
      const dominantEmotion = deriveDominantEmotion(negative, positive, recovery, risk);
      const routeHints = deriveRouteHints({
        riskScore,
        dominantEmotion,
        valence,
        positiveScore,
        negativeScore
      });

      const supportFlags = deriveSupportFlags(risk, negative, recovery);

      // Phase 14
      const result = {
        ok: true,
        module: 'EmotionRootGod',
        version: this.version,
        timestamp: Date.now(),

        input: {
          textLength: rawText.length,
          sentenceCount: splitSentences(rawText).length
        },

        scores: {
          negative: negativeScore,
          positive: positiveScore,
          recovery: recoveryScore,
          risk: riskScore
        },

        state: {
          valence,
          intensity,
          priority,
          dominantEmotion: dominantEmotion.category,
          dominantSource: dominantEmotion.source,
          dominantScore: dominantEmotion.score,
          momentum: momentum.direction,
          reinforcementMode,
          tone
        },

        buckets: {
          negative,
          positive,
          recovery,
          risk
        },

        continuity,

        recoverySignals,
        routeHints,
        supportFlags,
        contradictions,

        summary: this._buildSummary({
          valence,
          intensity,
          priority,
          dominantEmotion,
          negativeScore,
          positiveScore,
          recoveryScore,
          riskScore,
          momentum,
          contradictions,
          reinforcementMode
        }),

        responseHints: this._buildResponseHints({
          valence,
          intensity,
          priority,
          dominantEmotion,
          positive,
          negative,
          recovery,
          risk,
          supportFlags,
          reinforcementMode,
          momentum
        })
      };

      this._remember(result);
      return result;
    } catch (err) {
      return this._emptyResult('analysis_failure', err);
    }
  }

  detect(input, options = {}) {
    return this.analyze(input, options);
  }

  classify(input, options = {}) {
    const result = this.analyze(input, options);
    return result.state;
  }

  shouldEscalate(input, options = {}) {
    const result = this.analyze(input, options);
    return {
      escalate:
        result.supportFlags.crisis ||
        result.supportFlags.highDistress ||
        result.state.priority === 'critical',
      reason: result.supportFlags.crisis
        ? 'crisis_risk_detected'
        : result.supportFlags.highDistress
          ? 'high_distress_detected'
          : result.state.priority === 'critical'
            ? 'critical_priority'
            : 'none',
      state: result.state
    };
  }

  getReinforcementMarkers(input, options = {}) {
    const result = this.analyze(input, options);
    return {
      positiveCategories: result.buckets.positive.categories,
      recoveryCategories: result.buckets.recovery.categories,
      reinforcementMode: result.state.reinforcementMode,
      recoverySignals: result.recoverySignals
    };
  }

  getDistressMarkers(input, options = {}) {
    const result = this.analyze(input, options);
    return {
      negativeCategories: result.buckets.negative.categories,
      riskCategories: result.buckets.risk.categories,
      priority: result.state.priority,
      tone: result.state.tone
    };
  }

  extractMarkers(input, options = {}) {
    const result = this.analyze(input, options);
    return {
      negative: result.buckets.negative.matches,
      positive: result.buckets.positive.matches,
      recovery: result.buckets.recovery.matches,
      risk: result.buckets.risk.matches
    };
  }

  _deriveContinuity(nextState) {
    const prev = this.memory || {};
    const continuity = {
      lastValence: prev.lastValence || 'neutral',
      lastIntensity: prev.lastIntensity || 'flat',
      lastDominantEmotion: prev.lastDominantEmotion || 'neutral',
      stateShift: 'stable'
    };

    if (prev.lastValence && prev.lastValence !== nextState.valence) {
      continuity.stateShift = `${prev.lastValence}_to_${nextState.valence}`;
    }

    if (
      prev.lastIntensity &&
      prev.lastIntensity !== nextState.intensity &&
      continuity.stateShift === 'stable'
    ) {
      continuity.stateShift = `${prev.lastIntensity}_to_${nextState.intensity}`;
    }

    if (
      prev.lastDominantEmotion &&
      prev.lastDominantEmotion !== nextState.dominantEmotion &&
      continuity.stateShift === 'stable'
    ) {
      continuity.stateShift = `${prev.lastDominantEmotion}_to_${nextState.dominantEmotion}`;
    }

    return continuity;
  }

  _buildSummary(ctx) {
    return {
      concise: `${ctx.valence}:${ctx.intensity}:${ctx.dominantEmotion.category}`,
      narrative: this._buildNarrativeSummary(ctx)
    };
  }

  _buildNarrativeSummary(ctx) {
    if (ctx.riskScore >= 0.95) {
      return 'Critical distress or self-harm-related language detected. Stabilizing support tone is required.';
    }

    if (ctx.valence === 'negative') {
      return `Predominantly negative emotional state detected with ${ctx.dominantEmotion.category} leading. Recommended mode: ${ctx.reinforcementMode}.`;
    }

    if (ctx.valence === 'positive') {
      return `Predominantly positive emotional state detected with ${ctx.dominantEmotion.category} leading. Reinforcement and momentum-building are appropriate.`;
    }

    if (ctx.valence === 'mixed') {
      return `Mixed emotional state detected with competing positive and negative markers. Balanced validation and anchoring are appropriate.`;
    }

    return 'No strong emotional dominance detected. Neutral supportive presence is appropriate.';
  }

  _buildResponseHints(ctx) {
    const hints = [];

    if (ctx.supportFlags.crisis) {
      hints.push('lead_with_calm_and_direct_support');
      hints.push('encourage_immediate_human_support');
      hints.push('avoid_cheerful_language');
      hints.push('keep_response_grounded_and_clear');
      return uniqueStrings(hints);
    }

    if (ctx.dominantEmotion.category === 'anxiety') {
      hints.push('use_shorter_sentences');
      hints.push('reduce_cognitive_load');
      hints.push('suggest_grounding_or_breathing');
    }

    if (ctx.dominantEmotion.category === 'sadness' || ctx.dominantEmotion.category === 'loneliness') {
      hints.push('validate_feelings_first');
      hints.push('signal_presence_and_nonjudgment');
    }

    if (ctx.dominantEmotion.category === 'anger') {
      hints.push('do_not_match_heat');
      hints.push('stay_steady_and_structured');
    }

    if (ctx.reinforcementMode === 'reinforce_strength') {
      hints.push('acknowledge_progress');
      hints.push('reinforce_identity_strength');
    }

    if (ctx.reinforcementMode === 'amplify_progress') {
      hints.push('highlight_momentum');
      hints.push('anchor_small_wins');
      hints.push('invite_next_step');
    }

    if (ctx.reinforcementMode === 'affirm_recovery') {
      hints.push('affirm_regulation');
      hints.push('name_the_recovery_shift');
    }

    if (ctx.reinforcementMode === 'validate_then_anchor') {
      hints.push('reflect_both_sides');
      hints.push('offer_stability_without_overreaching');
    }

    if (ctx.momentum.direction === 'up') {
      hints.push('support_upward_trajectory');
    }

    if (ctx.momentum.direction === 'down') {
      hints.push('slow_down_and_stabilize');
    }

    if (ctx.positive.categories.some(c => c.category === 'confidence')) {
      hints.push('use_competence_mirroring');
    }

    if (ctx.negative.categories.some(c => c.category === 'shame')) {
      hints.push('avoid_language_that_implies_failure');
      hints.push('use_nonjudgmental_validation');
    }

    return uniqueStrings(hints);
  }

  _remember(result) {
    this.memory.lastSummary = result.summary?.concise || null;
    this.memory.lastValence = result.state?.valence || 'neutral';
    this.memory.lastIntensity = result.state?.intensity || 'flat';
    this.memory.lastDominantEmotion = result.state?.dominantEmotion || 'neutral';
    this.memory.lastTimestamp = Date.now();
  }

  _emptyResult(reason = 'empty', err = null) {
    return {
      ok: false,
      module: 'EmotionRootGod',
      version: this.version,
      reason,
      error: err ? String(err.message || err) : null,
      scores: {
        negative: 0,
        positive: 0,
        recovery: 0,
        risk: 0
      },
      state: {
        valence: 'neutral',
        intensity: 'flat',
        priority: 'normal',
        dominantEmotion: 'neutral',
        dominantSource: 'none',
        dominantScore: 0,
        momentum: 'flat',
        reinforcementMode: 'neutral_presence',
        tone: 'steady_neutral'
      },
      buckets: {
        negative: { bucket: 'negative', score: 0, hitCount: 0, weightedHits: 0, categories: [], matches: [] },
        positive: { bucket: 'positive', score: 0, hitCount: 0, weightedHits: 0, categories: [], matches: [] },
        recovery: { bucket: 'recovery', score: 0, hitCount: 0, weightedHits: 0, categories: [], matches: [] },
        risk: { bucket: 'risk', score: 0, hitCount: 0, weightedHits: 0, categories: [], matches: [] }
      },
      continuity: {
        lastValence: this.memory.lastValence || 'neutral',
        lastIntensity: this.memory.lastIntensity || 'flat',
        lastDominantEmotion: this.memory.lastDominantEmotion || 'neutral',
        stateShift: 'stable'
      },
      recoverySignals: [],
      routeHints: [],
      supportFlags: {
        crisis: false,
        highDistress: false,
        needsGentlePacing: false,
        avoidCelebratoryTone: false,
        recoveryPresent: false
      },
      contradictions: { count: 0, contradictions: [] },
      summary: {
        concise: 'neutral:flat:neutral',
        narrative: 'No emotional signal available.'
      },
      responseHints: ['fail_open_safe']
    };
  }
}

/**
 * Singleton instance
 */
const emotionRootGod = new EmotionRootGod();

/**
 * Convenience exports
 */
function analyzeEmotion(input, options = {}) {
  return emotionRootGod.analyze(input, options);
}

function classifyEmotion(input, options = {}) {
  return emotionRootGod.classify(input, options);
}

function shouldEscalateEmotion(input, options = {}) {
  return emotionRootGod.shouldEscalate(input, options);
}

function extractEmotionMarkers(input, options = {}) {
  return emotionRootGod.extractMarkers(input, options);
}

module.exports = {
  EmotionRootGod,
  emotionRootGod,
  analyzeEmotion,
  classifyEmotion,
  shouldEscalateEmotion,
  extractEmotionMarkers,
  LEXICON,
  DEFAULT_CONFIG
};

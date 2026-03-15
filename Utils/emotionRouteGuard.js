
'use strict';

/**
 * emotionRouteGuard.js v3.0.0
 *
 * Canonical emotional intake / scoring / routing-hint layer.
 * Purpose:
 * - detect broad and deep emotional signal
 * - normalize to stable emotional payload
 * - provide downstream routing hints without owning final response wording
 * - strengthen continuity and anti-loop readiness for stateSpine/chatEngine/supportResponse
 * - enrich emotional classification with behavioral nuance so downstream systems
 *   can choose pacing, follow-up style, and transition logic without menu bounce
 *
 * Downstream consumers:
 * - stateSpine.js
 * - chatEngine.js
 * - supportResponse.js
 * - sitebridge.js
 * - affectEngine.js
 * - tts.js
 */

const VERSION = 'emotionRouteGuard v3.1.0';

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

function normalizeForMatching(text) {
  return lower(text)
    .replace(/\bcan'?t\b/g, 'cannot')
    .replace(/\bwon'?t\b/g, 'will not')
    .replace(/\bi'?m\b/g, 'i am')
    .replace(/\bit'?s\b/g, 'it is')
    .replace(/\bdoesn'?t\b/g, 'does not')
    .replace(/\bdon'?t\b/g, 'do not')
    .replace(/\bfeels like\b/g, 'feel like')
    .replace(/[^a-z0-9?!' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectPresentationSignals(text) {
  const t = normalizeForMatching(text);
  return {
    isQuestion: /\?/.test(text) || /\b(can you|could you|would you|should i|what do i|how do i|why do i|am i|is this|do you think)\b/.test(t),
    asksForHelp: /\b(help me|i need help|can you help|need support|stay with me|talk to me)\b/.test(t),
    asksForDirectness: /\bjust tell me|be direct|straight up|give it to me straight|no fluff|exactly|just answer|simple answer\b/.test(t),
    asksForRelief: /\b(make it stop|i need this to stop|get me out of this|calm me down|help me breathe)\b/.test(t),
    hasContrast: /\b(but|though|except|yet)\b/.test(t),
    hasUncertainty: /\b(maybe|i guess|not sure|i think|possibly|kind of|sort of)\b/.test(t),
    narrativeDensity: (t.match(/\b(and|because|when|after|before|then|while)\b/g) || []).length,
    shortBurst: t.split(/\s+/).filter(Boolean).length <= 6,
    selfReferential: /\b(i|me|my|myself)\b/.test(t),
    relational: /\b(we|us|our|they|them|partner|friend|family|mother|father|wife|husband)\b/.test(t),
    mentionsLooping: /\b(loop|looping|same response|same thing|again and again|repeating|back to the same)\b/.test(t),
    requestsAction: /\b(what should i do|next step|what now|how do i move forward|what can i do)\b/.test(t),
    celebratoryBuzz: /\b(amazing|awesome|incredible|fantastic|outstanding|so good|so great|what a day|lets go|let's go|pumped)\b/.test(t),
    poeticObservation: /\b(beautiful day|beautiful morning|beautiful night|the sky|the air feels|the light feels|there is something beautiful|what a beautiful)\b/.test(t),
    recoveryPositive: /\b(finally|at last|coming together|going right|turning around|back on track|felt better|feeling better)\b/.test(t),
    achievementStatement: /\b(i did great|i did well|i crushed it|i nailed it|i made it happen|i pulled it off|i won|i accomplished)\b/.test(t),
    lifeAppraisal: /\b(my life is great|life is good|things are good|things are going well|i love my life|life feels good)\b/.test(t),
    purposeWorkAffirmation: /\b(i love what i do|love my work|love what i do for a living|love my job|proud of what i built|proud of what i have built|this work fits me|this is what i am meant to do)\b/.test(t),
    environmentalAppreciation: /\b(beautiful day|beautiful out|outstanding out there|gorgeous outside|lovely outside|what a day outside)\b/.test(t)
  };
}

const BEHAVIOR_ARCHETYPES = {
  witness: {
    openingStyle: 'reflective_presence',
    questionStyle: 'gentle_reflective',
    allowsActionShift: false
  },
  soothe: {
    openingStyle: 'calming_validation',
    questionStyle: 'grounding',
    allowsActionShift: false
  },
  ground: {
    openingStyle: 'steadying',
    questionStyle: 'sensory_or_scope_reduction',
    allowsActionShift: true
  },
  clarify: {
    openingStyle: 'orienting',
    questionStyle: 'narrowing',
    allowsActionShift: true
  },
  repair: {
    openingStyle: 'careful_nonshaming',
    questionStyle: 'repair_focused',
    allowsActionShift: true
  },
  reconnect: {
    openingStyle: 'relational_attunement',
    questionStyle: 'connection_or_meaning',
    allowsActionShift: true
  },
  boundary: {
    openingStyle: 'containment',
    questionStyle: 'limit_setting',
    allowsActionShift: true
  },
  activate: {
    openingStyle: 'energy_restore',
    questionStyle: 'small_next_step',
    allowsActionShift: true
  },
  celebrate: {
    openingStyle: 'affirming',
    questionStyle: 'extension',
    allowsActionShift: true
  },
  meaningMake: {
    openingStyle: 'meaning_reflection',
    questionStyle: 'integrative',
    allowsActionShift: true
  },
  challenge: {
    openingStyle: 'soft_challenge',
    questionStyle: 'reconsideration',
    allowsActionShift: true
  },
  channel: {
    openingStyle: 'directed_momentum',
    questionStyle: 'execution',
    allowsActionShift: true
  }
};

function createNuance(nuance = {}) {
  return {
    arousal: nuance.arousal || 'medium',
    socialDirection: nuance.socialDirection || 'mixed',
    timeOrientation: nuance.timeOrientation || 'present',
    controlState: nuance.controlState || 'uncertain',
    conversationNeed: nuance.conversationNeed || 'clarify',
    followupStyle: nuance.followupStyle || 'reflective',
    transitionReadiness: nuance.transitionReadiness || 'medium',
    loopRisk: nuance.loopRisk || 'medium',
    archetype: nuance.archetype || 'clarify',
    fallbackArchetype: nuance.fallbackArchetype || 'ground',
    questionPressure: nuance.questionPressure || 'medium',
    mirrorDepth: nuance.mirrorDepth || 'medium',
    grammarSensitivity: nuance.grammarSensitivity || 'medium',
    supportLockBias: nuance.supportLockBias || 'auto',
    followupVariants: uniq(nuance.followupVariants || ['reflective_restate', 'gentle_next_question']),
    transitionTargets: uniq(nuance.transitionTargets || ['clarify']),
    antiLoopShift: nuance.antiLoopShift || 'shift_to_grounding_after_two_similar_turns'
  };
}

function E(cluster, valence, phrases, supportMode, routeBias, nuance) {
  return {
    cluster,
    valence,
    phrases,
    supportMode,
    routeBias,
    nuance: createNuance(nuance)
  };
}

const EMOTION_DEFS = {
  admiration: E('affiliative', 'positive',
    ['admire', 'impressed by', 'respect deeply', 'look up to', 'amazed by them'],
    'affirm_and_channel', 'deepen_then_channel',
    { arousal: 'medium', socialDirection: 'relational', conversationNeed: 'reconnect', followupStyle: 'meaning_making', archetype: 'celebrate', fallbackArchetype: 'meaningMake', transitionTargets: ['deepen', 'channel'], loopRisk: 'low' }),

  adoration: E('affiliative', 'positive',
    ['adore', 'love so much', 'cherish', 'devoted to', 'deep affection'],
    'warm_reflection', 'deepen',
    { arousal: 'medium', socialDirection: 'relational', timeOrientation: 'present', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', transitionTargets: ['deepen', 'meaning_make'], loopRisk: 'low' }),

  aestheticAppreciation: E('reflective', 'positive',
    ['beautiful', 'stunning', 'gorgeous', 'moved by beauty', 'artistically powerful'],
    'reflective_depth', 'deepen',
    { arousal: 'medium', socialDirection: 'inward', timeOrientation: 'present', conversationNeed: 'witness', followupStyle: 'meaning_making', archetype: 'meaningMake', transitionTargets: ['deepen', 'maintain'], loopRisk: 'low' }),

  amusement: E('uplift', 'positive',
    ['funny', 'hilarious', 'that made me laugh', 'amused', 'cracking me up'],
    'light_mirroring', 'maintain',
    { arousal: 'medium', socialDirection: 'mixed', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'celebrate', transitionTargets: ['maintain', 'channel'], loopRisk: 'low' }),

  anger: E('threat', 'negative',
    ['angry', 'mad', 'furious', 'resentful', 'pissed off', 'hostile'],
    'regulate_and_redirect', 'stabilize',
    { arousal: 'high', socialDirection: 'outward', controlState: 'guarded', conversationNeed: 'boundary', followupStyle: 'grounding', archetype: 'boundary', fallbackArchetype: 'ground', questionPressure: 'low', transitionTargets: ['stabilize', 'repair'], loopRisk: 'high', antiLoopShift: 'name_need_then_reduce_scope' }),

  anxiety: E('threat', 'negative',
    ['anxious', 'worried', 'nervous', 'uneasy', 'on edge', 'spiraling'],
    'soothe_and_structure', 'stabilize',
    { arousal: 'high', socialDirection: 'inward', timeOrientation: 'future', controlState: 'uncertain', conversationNeed: 'soothe', followupStyle: 'grounding', archetype: 'soothe', fallbackArchetype: 'ground', questionPressure: 'low', mirrorDepth: 'high', transitionTargets: ['stabilize', 'clarify'], loopRisk: 'high', antiLoopShift: 'ground_before_question' }),

  awe: E('uplift', 'positive',
    ['in awe', 'speechless', 'overwhelmed in a good way', 'reverent', 'mind-blown'],
    'reflective_depth', 'deepen',
    { arousal: 'medium', socialDirection: 'mixed', conversationNeed: 'witness', followupStyle: 'meaning_making', archetype: 'meaningMake', transitionTargets: ['deepen', 'maintain'], loopRisk: 'low' }),

  awkwardness: E('uncertain', 'mixed',
    ['awkward', 'cringe', 'uncomfortable', 'socially weird', 'that was embarrassing'],
    'normalize_and_reframe', 'clarify',
    { arousal: 'medium', socialDirection: 'relational', controlState: 'guarded', conversationNeed: 'clarify', followupStyle: 'narrowing', archetype: 'clarify', transitionTargets: ['clarify', 'repair'], loopRisk: 'medium' }),

  boredom: E('low_activation', 'negative',
    ['bored', 'nothing interests me', 'unstimulated', 'flat', 'same old'],
    'activation_prompt', 'activate',
    { arousal: 'low', socialDirection: 'inward', conversationNeed: 'activate', followupStyle: 'action_step', archetype: 'activate', transitionTargets: ['activate', 'channel'], loopRisk: 'medium' }),

  calmness: E('regulated', 'positive',
    ['calm', 'peaceful', 'settled', 'at ease', 'grounded'],
    'steady_and_extend', 'maintain',
    { arousal: 'low', socialDirection: 'inward', controlState: 'agentic', conversationNeed: 'anchor', followupStyle: 'reflective', archetype: 'meaningMake', transitionTargets: ['maintain', 'deepen'], loopRisk: 'low' }),

  confusion: E('uncertain', 'negative',
    ['confused', 'do not understand', 'lost', 'unclear', 'mixed up'],
    'clarify_and_sequence', 'clarify',
    { arousal: 'medium', socialDirection: 'inward', controlState: 'uncertain', conversationNeed: 'clarify', followupStyle: 'narrowing', archetype: 'clarify', transitionTargets: ['clarify', 'ground'], loopRisk: 'medium' }),

  craving: E('drive', 'mixed',
    ['craving', 'want badly', 'yearning', 'hungry for', 'aching for'],
    'contain_and_channel', 'channel',
    { arousal: 'high', socialDirection: 'inward', timeOrientation: 'future', conversationNeed: 'boundary', followupStyle: 'narrowing', archetype: 'boundary', fallbackArchetype: 'channel', transitionTargets: ['boundary', 'channel'], loopRisk: 'medium' }),

  disgust: E('aversion', 'negative',
    ['disgusted', 'gross', 'repulsed', 'sickened', 'nauseated by'],
    'boundary_and_redirect', 'boundary',
    { arousal: 'medium', socialDirection: 'outward', controlState: 'guarded', conversationNeed: 'boundary', followupStyle: 'narrowing', archetype: 'boundary', questionPressure: 'low', transitionTargets: ['boundary', 'clarify'], loopRisk: 'medium' }),

  empatheticPain: E('relational', 'negative',
    ['hurting for them', 'my heart breaks for', 'feel their pain', 'suffering with them'],
    'validate_and_hold', 'deepen',
    { arousal: 'medium', socialDirection: 'relational', conversationNeed: 'witness', followupStyle: 'reflective', archetype: 'witness', transitionTargets: ['deepen', 'reconnect'], loopRisk: 'medium' }),

  entrenchment: E('resistance', 'negative',
    ['not changing my mind', 'dug in', 'standing firm', 'refuse to budge', 'locked in'],
    'gentle_challenge', 'challenge_softly',
    { arousal: 'medium', socialDirection: 'outward', controlState: 'guarded', conversationNeed: 'clarify', followupStyle: 'narrowing', archetype: 'challenge', fallbackArchetype: 'clarify', transitionTargets: ['challenge_softly', 'clarify'], loopRisk: 'high' }),

  envy: E('aversion', 'negative',
    ['jealous', 'envious', 'wish I had that', 'why not me', 'resent their success'],
    'reframe_and_channel', 'reframe',
    { arousal: 'medium', socialDirection: 'relational', controlState: 'powerless', conversationNeed: 'repair', followupStyle: 'meaning_making', archetype: 'repair', transitionTargets: ['reframe', 'channel'], loopRisk: 'medium' }),

  excitement: E('uplift', 'positive',
    ['excited', 'pumped', 'energized', 'cannot wait', 'thrilled'],
    'celebrate_and_channel', 'channel',
    { arousal: 'high', socialDirection: 'mixed', timeOrientation: 'future', controlState: 'agentic', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel', 'maintain'], loopRisk: 'low' }),

  fear: E('threat', 'negative',
    ['afraid', 'scared', 'fearful', 'terrified', 'fight or flight'],
    'soothe_and_ground', 'stabilize',
    { arousal: 'high', socialDirection: 'inward', timeOrientation: 'future', controlState: 'powerless', conversationNeed: 'soothe', followupStyle: 'grounding', archetype: 'soothe', fallbackArchetype: 'ground', questionPressure: 'low', transitionTargets: ['stabilize', 'clarify'], loopRisk: 'high' }),

  horror: E('threat', 'negative',
    ['horrified', 'appalled', 'shocked in a bad way', 'nightmarish'],
    'contain_and_ground', 'stabilize',
    { arousal: 'high', socialDirection: 'mixed', conversationNeed: 'ground', followupStyle: 'grounding', archetype: 'ground', questionPressure: 'low', transitionTargets: ['stabilize', 'boundary'], loopRisk: 'high' }),

  interest: E('curious', 'positive',
    ['interested', 'intrigued', 'tell me more', 'curious about', 'leaning in'],
    'expand_and_explore', 'deepen',
    { arousal: 'medium', socialDirection: 'mixed', conversationNeed: 'clarify', followupStyle: 'reflective', archetype: 'clarify', transitionTargets: ['deepen', 'clarify'], loopRisk: 'low' }),

  joy: E('uplift', 'positive',
    ['joy', 'joyful', 'happy', 'delighted', 'glad', 'elated'],
    'celebrate_and_anchor', 'maintain',
    { arousal: 'medium', socialDirection: 'mixed', controlState: 'agentic', conversationNeed: 'celebrate', followupStyle: 'reflective', archetype: 'celebrate', transitionTargets: ['maintain', 'deepen'], loopRisk: 'low' }),

  nostalgia: E('reflective', 'mixed',
    ['nostalgic', 'miss those days', 'takes me back', 'remember when', 'bittersweet memory'],
    'reflect_and_mean', 'deepen',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'past', conversationNeed: 'meaning_make', followupStyle: 'meaning_making', archetype: 'meaningMake', transitionTargets: ['deepen', 'reconnect'], loopRisk: 'medium' }),

  relief: E('regulated', 'positive',
    ['relieved', 'what a relief', 'weight off my shoulders', 'finally over'],
    'stabilize_and_anchor', 'maintain',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'present', controlState: 'agentic', conversationNeed: 'anchor', followupStyle: 'reflective', archetype: 'ground', transitionTargets: ['maintain', 'channel'], loopRisk: 'low' }),

  romance: E('affiliative', 'positive',
    ['romantic', 'falling for', 'in love', 'tender', 'drawn to them'],
    'warm_reflection', 'deepen',
    { arousal: 'medium', socialDirection: 'relational', timeOrientation: 'present', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', transitionTargets: ['deepen', 'meaning_make'], loopRisk: 'low' }),

  sadness: E('distress', 'negative',
    ['sad', 'down', 'heartbroken', 'grief', 'hopeless', 'disappointed'],
    'validate_and_soothe', 'stabilize',
    { arousal: 'low', socialDirection: 'inward', controlState: 'powerless', conversationNeed: 'witness', followupStyle: 'reflective', archetype: 'witness', fallbackArchetype: 'soothe', questionPressure: 'low', mirrorDepth: 'high', transitionReadiness: 'low', transitionTargets: ['stabilize', 'reconnect'], loopRisk: 'high' }),

  satisfaction: E('regulated', 'positive',
    ['satisfied', 'content', 'pleased', 'that feels right', 'fulfilled'],
    'anchor_and_extend', 'maintain',
    { arousal: 'low', socialDirection: 'inward', controlState: 'agentic', conversationNeed: 'anchor', followupStyle: 'meaning_making', archetype: 'celebrate', transitionTargets: ['maintain', 'channel'], loopRisk: 'low' }),

  sexualDesire: E('drive', 'mixed',
    ['desire', 'turned on', 'aroused', 'lust', 'sexual tension'],
    'contain_and_channel', 'boundary',
    { arousal: 'high', socialDirection: 'relational', timeOrientation: 'present', conversationNeed: 'boundary', followupStyle: 'narrowing', archetype: 'boundary', transitionTargets: ['boundary', 'clarify'], loopRisk: 'medium' }),

  surprise: E('uncertain', 'mixed',
    ['surprised', 'unexpected', 'did not see that coming', 'caught off guard'],
    'orient_and_clarify', 'clarify',
    { arousal: 'medium', socialDirection: 'mixed', conversationNeed: 'clarify', followupStyle: 'narrowing', archetype: 'clarify', transitionTargets: ['clarify', 'meaning_make'], loopRisk: 'low' }),

  empathy: E('relational', 'positive',
    ['i understand how they feel', 'empathize', 'feel with them', 'compassion for'],
    'attune_and_extend', 'deepen',
    { arousal: 'medium', socialDirection: 'relational', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', transitionTargets: ['deepen', 'reconnect'], loopRisk: 'low' }),

  triumph: E('uplift', 'positive',
    ['triumph', 'victory', 'i did it', 'overcame it', 'won'],
    'celebrate_and_channel', 'channel',
    { arousal: 'high', socialDirection: 'mixed', controlState: 'agentic', conversationNeed: 'celebrate', followupStyle: 'action_step', archetype: 'celebrate', transitionTargets: ['channel', 'maintain'], loopRisk: 'low' }),

  guilt: E('self_evaluative', 'negative',
    ['guilty', 'my fault', 'i should not have', 'regret what i did'],
    'repair_and_reframe', 'repair',
    { arousal: 'medium', socialDirection: 'inward', timeOrientation: 'past', controlState: 'guarded', conversationNeed: 'repair', followupStyle: 'repair_focused', archetype: 'repair', transitionTargets: ['repair', 'meaning_make'], loopRisk: 'high' }),

  pride: E('uplift', 'positive',
    ['proud', 'earned this', 'worked hard for this', 'i am proud of myself'],
    'affirm_and_anchor', 'maintain',
    { arousal: 'medium', socialDirection: 'inward', controlState: 'agentic', conversationNeed: 'celebrate', followupStyle: 'reflective', archetype: 'celebrate', transitionTargets: ['maintain', 'channel'], loopRisk: 'low' }),

  hope: E('uplift', 'positive',
    ['hopeful', 'maybe this can work', 'there is still a chance', 'optimistic'],
    'reinforce_and_channel', 'channel',
    { arousal: 'medium', socialDirection: 'inward', timeOrientation: 'future', controlState: 'agentic', conversationNeed: 'channel', followupStyle: 'meaning_making', archetype: 'channel', transitionTargets: ['channel', 'maintain'], loopRisk: 'medium' }),

  shame: E('self_evaluative', 'negative',
    ['ashamed', 'humiliated', 'i am embarrassed by myself', 'i feel small'],
    'repair_and_soothe', 'repair',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'past', controlState: 'powerless', conversationNeed: 'repair', followupStyle: 'reflective', archetype: 'repair', fallbackArchetype: 'soothe', questionPressure: 'low', mirrorDepth: 'high', transitionReadiness: 'low', transitionTargets: ['repair', 'reconnect'], loopRisk: 'high', antiLoopShift: 'reduce_questions_and_offer_nonjudgmental_reflection' }),

  disappointment: E('distress', 'negative',
    ['disappointed', 'let down', 'that hurt', 'it was not what i hoped'],
    'validate_and_reframe', 'stabilize',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'past', controlState: 'powerless', conversationNeed: 'witness', followupStyle: 'meaning_making', archetype: 'witness', transitionTargets: ['stabilize', 'repair'], loopRisk: 'medium' }),

  frustration: E('resistance', 'negative',
    ['frustrated', 'fed up', 'annoyed', 'this is exhausting', 'stuck again'],
    'regulate_and_unblock', 'clarify',
    { arousal: 'high', socialDirection: 'outward', controlState: 'guarded', conversationNeed: 'clarify', followupStyle: 'narrowing', archetype: 'clarify', fallbackArchetype: 'ground', transitionTargets: ['clarify', 'channel'], loopRisk: 'high', antiLoopShift: 'move_from_validation_to_unblocking_step' }),

  curiosity: E('curious', 'positive',
    ['curious', 'wondering', 'want to understand', 'explore this', 'interested in why'],
    'expand_and_explore', 'deepen',
    { arousal: 'medium', socialDirection: 'mixed', conversationNeed: 'clarify', followupStyle: 'reflective', archetype: 'clarify', transitionTargets: ['deepen', 'clarify'], loopRisk: 'low' }),

  trust: E('affiliative', 'positive',
    ['trust', 'i believe in', 'feel safe with', 'depend on'],
    'steady_and_extend', 'maintain',
    { arousal: 'low', socialDirection: 'relational', controlState: 'agentic', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', transitionTargets: ['maintain', 'deepen'], loopRisk: 'low' }),

  anticipation: E('drive', 'positive',
    ['looking forward to', 'anticipating', 'waiting for', 'counting down'],
    'channel_forward', 'channel',
    { arousal: 'medium', socialDirection: 'mixed', timeOrientation: 'future', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel', 'maintain'], loopRisk: 'low' }),

  helplessness: E('distress', 'negative',
    ['helpless', 'cannot do anything', 'powerless', 'do not know what to do anymore'],
    'stabilize_then_shrink_scope', 'stabilize',
    { arousal: 'low', socialDirection: 'inward', controlState: 'powerless', conversationNeed: 'soothe', followupStyle: 'grounding', archetype: 'soothe', fallbackArchetype: 'ground', questionPressure: 'low', transitionReadiness: 'low', transitionTargets: ['stabilize', 'ground'], loopRisk: 'high' }),

  loneliness: E('distress', 'negative',
    ['lonely', 'alone', 'isolated', 'nobody gets me', 'by myself in this'],
    'attune_and_connect', 'deepen',
    { arousal: 'low', socialDirection: 'relational', controlState: 'powerless', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', questionPressure: 'low', transitionReadiness: 'low', transitionTargets: ['deepen', 'reconnect'], loopRisk: 'high' }),

  determination: E('drive', 'positive',
    ['determined', 'i will keep going', 'locked in to finish', 'committed'],
    'channel_forward', 'channel',
    { arousal: 'high', socialDirection: 'inward', controlState: 'agentic', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel', 'maintain'], loopRisk: 'low' }),

  grief: E('distress', 'negative',
    ['grief', 'mourning', 'loss', 'bereaved', 'devastated by the loss'],
    'validate_and_hold', 'stabilize',
    { arousal: 'medium', socialDirection: 'inward', timeOrientation: 'past', controlState: 'powerless', conversationNeed: 'witness', followupStyle: 'reflective', archetype: 'witness', questionPressure: 'low', mirrorDepth: 'high', transitionReadiness: 'low', transitionTargets: ['stabilize', 'reconnect'], loopRisk: 'high' }),

  despair: E('distress', 'negative',
    ['despair', 'there is no point', 'nothing will change', 'i have no hope', 'bleak'],
    'stabilize_then_hold', 'stabilize',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'future', controlState: 'powerless', conversationNeed: 'soothe', followupStyle: 'grounding', archetype: 'soothe', fallbackArchetype: 'witness', questionPressure: 'low', mirrorDepth: 'high', transitionReadiness: 'low', transitionTargets: ['stabilize'], loopRisk: 'high' }),

  abandonment: E('distress', 'negative',
    ['abandoned', 'left behind', 'they left me', 'discarded', 'forsaken'],
    'attune_and_reassure', 'deepen',
    { arousal: 'medium', socialDirection: 'relational', timeOrientation: 'past', controlState: 'powerless', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', questionPressure: 'low', transitionReadiness: 'low', transitionTargets: ['deepen', 'repair'], loopRisk: 'high' }),

  overwhelm: E('distress', 'negative',
    ['overwhelmed', 'too much', 'i cannot handle all this', 'flooded', 'drowning in it'],
    'stabilize_then_shrink_scope', 'stabilize',
    { arousal: 'high', socialDirection: 'inward', controlState: 'powerless', conversationNeed: 'ground', followupStyle: 'grounding', archetype: 'ground', questionPressure: 'low', transitionTargets: ['stabilize', 'clarify'], loopRisk: 'high' }),

  numbness: E('distress', 'mixed',
    ['numb', 'cannot feel anything', 'checked out', 'empty inside', 'emotionless'],
    'gentle_activation_with_presence', 'activate',
    { arousal: 'low', socialDirection: 'inward', controlState: 'powerless', conversationNeed: 'witness', followupStyle: 'grounding', archetype: 'witness', fallbackArchetype: 'activate', questionPressure: 'low', transitionReadiness: 'low', transitionTargets: ['stabilize', 'activate'], loopRisk: 'high' }),

  rejection: E('distress', 'negative',
    ['rejected', 'turned down', 'not chosen', 'cast aside', 'pushed away'],
    'validate_and_repair', 'repair',
    { arousal: 'medium', socialDirection: 'relational', timeOrientation: 'past', controlState: 'powerless', conversationNeed: 'repair', followupStyle: 'reflective', archetype: 'repair', transitionTargets: ['repair', 'reconnect'], loopRisk: 'high' }),

  dread: E('threat', 'negative',
    ['dread', 'impending doom', 'something bad is coming', 'looming fear', 'heavy foreboding'],
    'soothe_and_ground', 'stabilize',
    { arousal: 'high', socialDirection: 'inward', timeOrientation: 'future', controlState: 'powerless', conversationNeed: 'ground', followupStyle: 'grounding', archetype: 'ground', transitionTargets: ['stabilize', 'clarify'], loopRisk: 'high' }),

  panic: E('threat', 'negative',
    ['panic', 'panicking', 'cannot breathe', 'freaking out', 'full panic mode'],
    'immediate_grounding', 'stabilize',
    { arousal: 'high', socialDirection: 'inward', controlState: 'powerless', conversationNeed: 'ground', followupStyle: 'grounding', archetype: 'ground', questionPressure: 'none', mirrorDepth: 'low', transitionReadiness: 'low', transitionTargets: ['stabilize'], loopRisk: 'high' }),

  agitation: E('threat', 'negative',
    ['agitated', 'restless', 'amped up', 'riled up', 'cannot settle'],
    'regulate_and_steady', 'stabilize',
    { arousal: 'high', socialDirection: 'mixed', controlState: 'guarded', conversationNeed: 'ground', followupStyle: 'grounding', archetype: 'ground', transitionTargets: ['stabilize', 'clarify'], loopRisk: 'high' }),

  insecurity: E('self_evaluative', 'negative',
    ['insecure', 'not enough', 'second guessing myself', 'feel small compared to them', 'self doubt'],
    'reassure_and_reframe', 'repair',
    { arousal: 'medium', socialDirection: 'inward', controlState: 'uncertain', conversationNeed: 'repair', followupStyle: 'reflective', archetype: 'repair', transitionTargets: ['repair', 'reconnect'], loopRisk: 'medium' }),

  resentment: E('resistance', 'negative',
    ['resentment', 'i resent them', 'still bitter about it', 'hard to let it go', 'carrying this anger'],
    'regulate_then_name_need', 'challenge_softly',
    { arousal: 'medium', socialDirection: 'outward', timeOrientation: 'past', controlState: 'guarded', conversationNeed: 'boundary', followupStyle: 'meaning_making', archetype: 'challenge', fallbackArchetype: 'boundary', transitionTargets: ['repair', 'clarify'], loopRisk: 'high' }),

  bitterness: E('resistance', 'negative',
    ['bitter', 'jaded', 'sour about it', 'hardened by it', 'it left a bitter taste'],
    'soften_and_reframe', 'challenge_softly',
    { arousal: 'low', socialDirection: 'outward', timeOrientation: 'past', controlState: 'guarded', conversationNeed: 'meaning_make', followupStyle: 'meaning_making', archetype: 'challenge', transitionTargets: ['repair', 'meaning_make'], loopRisk: 'high' }),

  defensiveness: E('resistance', 'negative',
    ['defensive', 'that is not what i meant', 'i have to defend myself', 'pushing back', 'guarded'],
    'deescalate_and_clarify', 'clarify',
    { arousal: 'medium', socialDirection: 'outward', controlState: 'guarded', conversationNeed: 'clarify', followupStyle: 'narrowing', archetype: 'clarify', questionPressure: 'low', transitionTargets: ['clarify', 'repair'], loopRisk: 'high' }),

  suspicion: E('resistance', 'negative',
    ['suspicious', 'do not trust this', 'something feels off', 'skeptical of their motives', 'i doubt it'],
    'validate_caution_then_clarify', 'clarify',
    { arousal: 'medium', socialDirection: 'outward', controlState: 'guarded', conversationNeed: 'clarify', followupStyle: 'narrowing', archetype: 'clarify', transitionTargets: ['clarify', 'boundary'], loopRisk: 'medium' }),

  vigilance: E('threat', 'negative',
    ['hypervigilant', 'always on guard', 'watching for danger', 'cannot let my guard down', 'alert all the time'],
    'soothe_and_reduce_scan', 'stabilize',
    { arousal: 'high', socialDirection: 'outward', controlState: 'guarded', conversationNeed: 'ground', followupStyle: 'grounding', archetype: 'ground', transitionTargets: ['stabilize', 'clarify'], loopRisk: 'high' }),

  contempt: E('aversion', 'negative',
    ['contempt', 'beneath me', 'disdain', 'i cannot respect them at all', 'scorn'],
    'boundary_and_reframe', 'boundary',
    { arousal: 'medium', socialDirection: 'outward', controlState: 'guarded', conversationNeed: 'boundary', followupStyle: 'meaning_making', archetype: 'boundary', transitionTargets: ['boundary', 'clarify'], loopRisk: 'medium' }),

  embarrassment: E('self_evaluative', 'negative',
    ['embarrassed', 'mortified', 'red in the face', 'want to disappear', 'cringing at myself'],
    'normalize_and_repair', 'repair',
    { arousal: 'medium', socialDirection: 'relational', timeOrientation: 'past', controlState: 'guarded', conversationNeed: 'repair', followupStyle: 'reflective', archetype: 'repair', transitionTargets: ['repair', 'reconnect'], loopRisk: 'medium' }),

  remorse: E('self_evaluative', 'negative',
    ['remorse', 'i feel sorry for what i did', 'deep regret', 'i hurt someone', 'wish i could undo it'],
    'repair_and_accountability', 'repair',
    { arousal: 'medium', socialDirection: 'relational', timeOrientation: 'past', controlState: 'agentic', conversationNeed: 'repair', followupStyle: 'repair_focused', archetype: 'repair', transitionTargets: ['repair', 'meaning_make'], loopRisk: 'medium' }),

  regret: E('self_evaluative', 'negative',
    ['regret', 'wish i had done it differently', 'if only', 'i should have known', 'bad choice'],
    'reframe_and_extract_learning', 'repair',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'past', controlState: 'uncertain', conversationNeed: 'repair', followupStyle: 'meaning_making', archetype: 'repair', transitionTargets: ['repair', 'channel'], loopRisk: 'medium' }),

  selfForgiveness: E('self_evaluative', 'positive',
    ['forgive myself', 'letting myself heal', 'i am giving myself grace', 'releasing self blame', 'self compassion for me'],
    'affirm_and_anchor', 'maintain',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'present', controlState: 'agentic', conversationNeed: 'repair', followupStyle: 'meaning_making', archetype: 'repair', transitionTargets: ['maintain', 'renewal'], loopRisk: 'low' }),

  tenderness: E('affiliative', 'positive',
    ['tenderness', 'soft toward them', 'gentle affection', 'softness in me', 'fond tenderness'],
    'warm_reflection', 'deepen',
    { arousal: 'low', socialDirection: 'relational', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', transitionTargets: ['deepen', 'meaning_make'], loopRisk: 'low' }),

  longing: E('reflective', 'mixed',
    ['longing', 'ache for', 'miss them deeply', 'reach for something i cannot have', 'persistent ache'],
    'attune_and_hold', 'deepen',
    { arousal: 'medium', socialDirection: 'relational', timeOrientation: 'future', controlState: 'powerless', conversationNeed: 'witness', followupStyle: 'meaning_making', archetype: 'witness', transitionTargets: ['deepen', 'repair'], loopRisk: 'medium' }),

  belonging: E('relational', 'positive',
    ['belong', 'feel at home here', 'part of something', 'accepted by them', 'i fit here'],
    'affirm_and_extend_connection', 'maintain',
    { arousal: 'low', socialDirection: 'relational', controlState: 'agentic', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', transitionTargets: ['maintain', 'deepen'], loopRisk: 'low' }),

  alienation: E('relational', 'negative',
    ['alienated', 'disconnected from everyone', 'do not fit anywhere', 'estranged', 'cut off'],
    'attune_and_connect', 'deepen',
    { arousal: 'low', socialDirection: 'relational', controlState: 'powerless', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', transitionTargets: ['deepen', 'stabilize'], loopRisk: 'high' }),

  melancholy: E('reflective', 'mixed',
    ['melancholy', 'heavy wistful sadness', 'soft sadness', 'blue mood', 'somber'],
    'reflect_and_hold', 'deepen',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'past', conversationNeed: 'meaning_make', followupStyle: 'reflective', archetype: 'meaningMake', transitionTargets: ['deepen', 'stabilize'], loopRisk: 'medium' }),

  wistfulness: E('reflective', 'mixed',
    ['wistful', 'soft ache', 'gentle yearning', 'sweet sadness', 'faint longing'],
    'reflect_and_mean', 'deepen',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'past', conversationNeed: 'meaning_make', followupStyle: 'meaning_making', archetype: 'meaningMake', transitionTargets: ['deepen', 'reconnect'], loopRisk: 'medium' }),

  reverence: E('reflective', 'positive',
    ['reverence', 'deep respect', 'sacred feeling', 'solemn admiration', 'honored by this'],
    'reflective_depth', 'deepen',
    { arousal: 'low', socialDirection: 'mixed', conversationNeed: 'meaning_make', followupStyle: 'meaning_making', archetype: 'meaningMake', transitionTargets: ['deepen', 'maintain'], loopRisk: 'low' }),

  gratitude: E('uplift', 'positive',
    ['grateful', 'thankful', 'appreciative', 'blessed by this', 'i appreciate that deeply'],
    'celebrate_and_anchor', 'maintain',
    { arousal: 'low', socialDirection: 'relational', controlState: 'agentic', conversationNeed: 'celebrate', followupStyle: 'reflective', archetype: 'celebrate', transitionTargets: ['maintain', 'reconnect'], loopRisk: 'low' }),

  connectedness: E('relational', 'positive',
    ['connected', 'in sync', 'close to them', 'linked to something bigger', 'feel joined'],
    'attune_and_extend', 'maintain',
    { arousal: 'low', socialDirection: 'relational', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', transitionTargets: ['maintain', 'deepen'], loopRisk: 'low' }),

  compassion: E('relational', 'positive',
    ['compassion', 'care for them', 'gentle concern', 'want to ease their pain', 'soft heart'],
    'attune_and_extend', 'deepen',
    { arousal: 'medium', socialDirection: 'relational', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'reconnect', transitionTargets: ['deepen', 'channel'], loopRisk: 'low' }),

  courage: E('drive', 'positive',
    ['courage', 'brave enough', 'facing it anyway', 'i can do hard things', 'showing up despite fear'],
    'affirm_and_channel', 'channel',
    { arousal: 'medium', socialDirection: 'inward', timeOrientation: 'future', controlState: 'agentic', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel', 'maintain'], loopRisk: 'low' }),

  confidence: E('drive', 'positive',
    ['confident', 'sure of myself', 'i have this', 'solid in my ability', 'self assured'],
    'affirm_and_channel', 'channel',
    { arousal: 'medium', socialDirection: 'inward', controlState: 'agentic', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel', 'maintain'], loopRisk: 'low' }),

  empowerment: E('drive', 'positive',
    ['empowered', 'taking my power back', 'i can choose now', 'strong in myself', 'reclaiming myself'],
    'reinforce_and_channel', 'channel',
    { arousal: 'high', socialDirection: 'inward', controlState: 'agentic', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel', 'maintain'], loopRisk: 'low' }),

  inspiration: E('uplift', 'positive',
    ['inspired', 'lit up by this idea', 'sparked', 'creatively moved', 'motivated by possibility'],
    'celebrate_and_channel', 'channel',
    { arousal: 'medium', socialDirection: 'mixed', timeOrientation: 'future', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel', 'meaning_make'], loopRisk: 'low' }),

  playfulness: E('uplift', 'positive',
    ['playful', 'lighthearted', 'teasing in a fun way', 'want to play', 'silly mood'],
    'light_mirroring', 'maintain',
    { arousal: 'medium', socialDirection: 'relational', conversationNeed: 'reconnect', followupStyle: 'reflective', archetype: 'celebrate', transitionTargets: ['maintain', 'channel'], loopRisk: 'low' }),

  renewal: E('regulated', 'positive',
    ['renewed', 'fresh start', 'beginning again', 'restored', 'starting to feel alive again'],
    'anchor_and_extend', 'channel',
    { arousal: 'medium', socialDirection: 'inward', timeOrientation: 'future', controlState: 'agentic', conversationNeed: 'anchor', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['maintain', 'channel'], loopRisk: 'low' }),

  acceptance: E('regulated', 'positive',
    ['acceptance', 'making peace with it', 'it is what it is and i can hold that', 'letting it be true', 'coming to terms with it'],
    'anchor_and_mean', 'maintain',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'present', controlState: 'agentic', conversationNeed: 'meaning_make', followupStyle: 'meaning_making', archetype: 'meaningMake', transitionTargets: ['maintain', 'reconnect'], loopRisk: 'low' }),

  contentment: E('regulated', 'positive',
    ['content', 'quietly happy', 'enough as it is', 'settled and satisfied', 'simple contentment'],
    'anchor_and_extend', 'maintain',
    { arousal: 'low', socialDirection: 'inward', controlState: 'agentic', conversationNeed: 'anchor', followupStyle: 'reflective', archetype: 'celebrate', transitionTargets: ['maintain'], loopRisk: 'low' }),

  serenity: E('regulated', 'positive',
    ['serene', 'still inside', 'deeply peaceful', 'tranquil', 'softly at peace'],
    'steady_and_extend', 'maintain',
    { arousal: 'low', socialDirection: 'inward', controlState: 'agentic', conversationNeed: 'anchor', followupStyle: 'reflective', archetype: 'ground', transitionTargets: ['maintain', 'deepen'], loopRisk: 'low' }),

  focus: E('drive', 'positive',
    ['focused', 'dialed in', 'locked in mentally', 'clear on the task', 'concentrated'],
    'channel_forward', 'channel',
    { arousal: 'medium', socialDirection: 'inward', controlState: 'agentic', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel'], loopRisk: 'low' }),

  resolve: E('drive', 'positive',
    ['resolve', 'resolved to do this', 'firm decision', 'settled determination', 'i am resolved'],
    'channel_forward', 'channel',
    { arousal: 'medium', socialDirection: 'inward', controlState: 'agentic', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel', 'maintain'], loopRisk: 'low' }),

  determinedHope: E('drive', 'positive',
    ['determined hope', 'hope with backbone', 'still fighting for it', 'i believe and i will work for it', 'stubborn hope'],
    'reinforce_and_channel', 'channel',
    { arousal: 'medium', socialDirection: 'inward', timeOrientation: 'future', controlState: 'agentic', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel', 'maintain'], loopRisk: 'low' }),

  fragileHope: E('uplift', 'mixed',
    ['fragile hope', 'small hope', 'trying to hope', 'barely holding onto hope', 'tentative optimism'],
    'protect_and_reinforce', 'stabilize_then_channel',
    { arousal: 'low', socialDirection: 'inward', timeOrientation: 'future', controlState: 'uncertain', conversationNeed: 'soothe', followupStyle: 'reflective', archetype: 'soothe', fallbackArchetype: 'channel', questionPressure: 'low', transitionTargets: ['stabilize', 'channel'], loopRisk: 'medium' }),

  reluctance: E('resistance', 'mixed',
    ['reluctant', 'hesitant to do it', 'dragging my feet', 'not ready to commit', 'holding back'],
    'validate_then_narrow', 'clarify',
    { arousal: 'low', socialDirection: 'inward', controlState: 'guarded', conversationNeed: 'clarify', followupStyle: 'narrowing', archetype: 'clarify', transitionTargets: ['clarify', 'channel'], loopRisk: 'medium' }),

  innerConflict: E('uncertain', 'mixed',
    ['torn', 'part of me wants to and part of me does not', 'conflicted', 'two sides in me', 'inner conflict'],
    'split_and_sequence', 'clarify',
    { arousal: 'medium', socialDirection: 'inward', controlState: 'uncertain', conversationNeed: 'clarify', followupStyle: 'meaning_making', archetype: 'clarify', transitionTargets: ['clarify', 'repair'], loopRisk: 'high' }),

  paralysis: E('threat', 'negative',
    ['frozen', 'paralyzed', 'cannot move on it', 'stuck in place', 'cannot act'],
    'stabilize_then_shrink_scope', 'stabilize',
    { arousal: 'high', socialDirection: 'inward', controlState: 'powerless', conversationNeed: 'ground', followupStyle: 'grounding', archetype: 'ground', questionPressure: 'low', transitionReadiness: 'low', transitionTargets: ['stabilize'], loopRisk: 'high' }),

  devotion: E('affiliative', 'positive',
    ['devotion', 'deep commitment', 'steadfast love', 'fully committed to them', 'faithful dedication'],
    'warm_reflection', 'deepen',
    { arousal: 'medium', socialDirection: 'relational', controlState: 'agentic', conversationNeed: 'reconnect', followupStyle: 'meaning_making', archetype: 'reconnect', transitionTargets: ['deepen', 'maintain'], loopRisk: 'low' }),

  yearning: E('reflective', 'mixed',
    ['yearning', 'aching toward', 'deep desire for connection', 'pull toward something missing', 'hungry ache'],
    'attune_and_hold', 'deepen',
    { arousal: 'medium', socialDirection: 'relational', timeOrientation: 'future', controlState: 'powerless', conversationNeed: 'witness', followupStyle: 'reflective', archetype: 'witness', transitionTargets: ['deepen', 'repair'], loopRisk: 'medium' }),

  defeat: E('distress', 'negative',
    ['defeated', 'beaten down', 'i have nothing left', 'gave it everything and lost', 'crushed'],
    'stabilize_then_hold', 'stabilize',
    { arousal: 'low', socialDirection: 'inward', controlState: 'powerless', conversationNeed: 'soothe', followupStyle: 'grounding', archetype: 'soothe', questionPressure: 'low', transitionReadiness: 'low', transitionTargets: ['stabilize'], loopRisk: 'high' }),

  empoweredRelief: E('regulated', 'positive',
    ['relieved and stronger', 'lighter and more capable', 'i can breathe and act now', 'released and ready', 'clearer and stronger now'],
    'anchor_and_channel', 'channel',
    { arousal: 'medium', socialDirection: 'inward', timeOrientation: 'present', controlState: 'agentic', conversationNeed: 'channel', followupStyle: 'action_step', archetype: 'channel', transitionTargets: ['channel', 'maintain'], loopRisk: 'low' })
};

const INTENSIFIERS = ['very', 'really', 'so', 'extremely', 'deeply', 'incredibly', 'massively', 'seriously', 'totally', 'completely'];
const REGULATION_PHRASES = ['take a breath', 'calm down', 'steady', 'one step at a time', 'ground myself', 'slow down', 'pause for a second'];
const RECOVERY_PHRASES = ['feeling better', 'coming back', 'recovering', 'getting through it', 'turning a corner', 'starting to feel okay', 'more settled now'];
const CONTRADICTION_PAIRS = [
  ['joy', 'sadness'],
  ['calmness', 'anxiety'],
  ['hope', 'helplessness'],
  ['trust', 'fear'],
  ['pride', 'shame'],
  ['relief', 'horror'],
  ['confidence', 'insecurity'],
  ['belonging', 'alienation'],
  ['acceptance', 'resentment']
];

function emotionKeys() {
  return Object.keys(EMOTION_DEFS);
}

function addScore(scores, emotion, amount) {
  if (!emotion || !amount) return;
  scores[emotion] = round((scores[emotion] || 0) + amount);
}

const POSITIVE_PHRASE_BOOSTS = [
  {
    re: /\bi love what i do(?: for a living)?\b|\blove my work\b|\blove my job\b|\bthis work fits me\b|\bmeant to do this\b/,
    boosts: { satisfaction: 1.1, pride: 0.95, gratitude: 0.8, confidence: 0.55, inspiration: 0.5 }
  },
  {
    re: /\bmy life is great\b|\blife is good\b|\bthings are going well\b|\bthings are good\b|\bi love my life\b/,
    boosts: { gratitude: 1.0, contentment: 0.95, satisfaction: 0.8, joy: 0.7, optimism: 0.65 }
  },
  {
    re: /\bit is a beautiful day\b|\bbeautiful day today\b|\boutstanding out there today\b|\bgorgeous outside\b|\bwhat a beautiful day\b/,
    boosts: { aestheticAppreciation: 1.1, awe: 0.85, calmness: 0.75, joy: 0.6, gratitude: 0.4 }
  },
  {
    re: /\bi did great today\b|\bi did really well today\b|\bi crushed it\b|\bi nailed it\b|\bi pulled it off\b/,
    boosts: { pride: 1.1, triumph: 0.95, confidence: 0.8, satisfaction: 0.55, determination: 0.35 }
  },
  {
    re: /\bfinally going right\b|\bfinally coming together\b|\bturning around\b|\bback on track\b|\bthings are finally going right\b/,
    boosts: { relief: 1.0, hope: 0.85, renewal: 0.7, optimism: 0.65, empoweredRelief: 0.55 }
  }
];


function basePayload() {
  return {
    ok: true,
    source: 'emotionRouteGuard',
    version: VERSION,
    createdAt: Date.now(),
    catalogSize: emotionKeys().length,
    archetypeCount: Object.keys(BEHAVIOR_ARCHETYPES).length,
    input: {
      textLength: 0,
      hasPriorState: false
    },
    primaryEmotion: null,
    secondaryEmotion: null,
    tertiaryEmotion: null,
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
    nuanceProfile: createNuance(),
    presentationSignals: {},
    expressionStyle: 'plain_statement',
    deliveryTone: 'warm_affirming',
    semanticFrame: 'plain_statement',
    conversationPlan: {},
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

    if (def.nuance?.timeOrientation === 'past' && /\bremember|before|used to|back then|lost\b/.test(t)) score += 0.15;
    if (def.nuance?.timeOrientation === 'future' && /\bsoon|later|next|coming|about to|might\b/.test(t)) score += 0.15;
    if (def.nuance?.socialDirection === 'relational' && /\bthey|them|we|us|relationship|family|friend|partner\b/.test(t)) score += 0.15;
    if (def.nuance?.controlState === 'powerless' && /\bcannot|can't|powerless|stuck|trapped|helpless\b/.test(t)) score += 0.2;
    if (def.nuance?.arousal === 'high' && /\bpanic|spiral|overwhelmed|furious|terrified|freaking out\b/.test(t)) score += 0.2;

    if (INTENSIFIERS.some((w) => t.includes(` ${w} `)) && containsPhrase(t, def.phrases)) {
      score += 0.35;
    }

    if (score > 0) scores[emotion] = round(score);
  }

  for (const boost of POSITIVE_PHRASE_BOOSTS) {
    if (!boost.re.test(t)) continue;
    for (const [emotion, amount] of Object.entries(boost.boosts || {})) addScore(scores, emotion, amount);
  }

  return scores;
}

function deriveDominance(scores) {
  const ranked = topEntries(scores, 6);
  const primary = ranked[0]?.key || null;
  const secondary = ranked[1]?.key || null;
  const tertiary = ranked[2]?.key || null;
  const topScore = ranked[0]?.score || 0;
  const secondScore = ranked[1]?.score || 0;
  const confidence = topScore <= 0 ? 0 : round(clamp((topScore - (secondScore * 0.35)) / (topScore + 0.5), 0, 1));
  return { ranked, primary, secondary, tertiary, confidence };
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
  const mixedClusters = new Set(['uncertain', 'distress', 'threat', 'resistance', 'self_evaluative']);
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
  if (intensity >= 0.85 && def?.nuance?.questionPressure === 'none') {
    mode = 'immediate_grounding';
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

function deriveNuanceProfile(primary, secondary, text = '', priorState = {}) {
  const p = EMOTION_DEFS[primary]?.nuance || createNuance();
  const s = EMOTION_DEFS[secondary]?.nuance || null;
  const signals = detectPresentationSignals(text);
  const prevLoop = num(priorState.sameArchetypeCount, 0) >= 2 || num(priorState.noProgressTurnCount, 0) >= 2;

  const profile = !s ? { ...p } : {
    ...p,
    secondaryBlend: {
      arousal: s.arousal,
      conversationNeed: s.conversationNeed,
      archetype: s.archetype
    },
    transitionTargets: uniq([...(p.transitionTargets || []), ...(s.transitionTargets || [])]),
    followupVariants: uniq([...(p.followupVariants || []), ...(s.followupVariants || [])]),
    loopRisk: p.loopRisk === 'high' || s.loopRisk === 'high'
      ? 'high'
      : (p.loopRisk === 'medium' || s.loopRisk === 'medium' ? 'medium' : 'low')
  };

  if (signals.asksForDirectness || signals.requestsAction) {
    profile.questionPressure = profile.questionPressure === 'none' ? 'none' : 'low';
    profile.followupStyle = 'narrowing';
    profile.followupVariants = uniq(['direct_answer_then_one_question', ...(profile.followupVariants || [])]);
  }

  if (signals.isQuestion && profile.archetype === 'witness' && profile.transitionReadiness !== 'low') {
    profile.fallbackArchetype = 'clarify';
  }

  if (signals.shortBurst && ['high', 'medium'].includes(profile.loopRisk)) {
    profile.mirrorDepth = 'low';
    profile.followupVariants = uniq(['brief_presence', ...(profile.followupVariants || [])]);
  }

  if (signals.narrativeDensity >= 2) {
    profile.mirrorDepth = profile.mirrorDepth === 'low' ? 'medium' : 'high';
    profile.followupVariants = uniq(['narrative_reflection', ...(profile.followupVariants || [])]);
  }

  if (signals.mentionsLooping || prevLoop) {
    profile.loopRisk = 'high';
    profile.supportLockBias = 'strong';
    profile.followupVariants = uniq(['novel_move_required', ...(profile.followupVariants || [])]);
  }

  if (signals.asksForRelief) {
    profile.archetype = ['soothe', 'ground'].includes(profile.archetype) ? profile.archetype : 'ground';
    profile.questionPressure = 'none';
    profile.transitionReadiness = 'low';
  }

  return profile;
}


function deriveExpressionStyle(payload) {
  const signals = payload.presentationSignals || {};
  const text = normalizeForMatching(payload.inputText || '');
  if (signals.achievementStatement) return 'achievement_statement';
  if (signals.purposeWorkAffirmation) return 'purpose_work_affirmation';
  if (signals.poeticObservation || signals.environmentalAppreciation) return 'poetic_observation';
  if (signals.recoveryPositive) return 'recovery_statement';
  if (signals.lifeAppraisal) return 'life_appraisal';
  if (signals.celebratoryBuzz) return 'celebratory_burst';
  if (payload.valence === 'positive' && signals.shortBurst) return 'direct_positive';
  if (payload.valence === 'negative' && signals.shortBurst) return 'direct_distress';
  if (signals.narrativeDensity >= 2) return 'reflective_statement';
  if (/i feel|i am|it is/.test(text)) return payload.valence === 'positive' ? 'direct_positive' : 'plain_statement';
  return 'plain_statement';
}

function deriveDeliveryTone(payload) {
  const style = safeStr(payload.expressionStyle || '').toLowerCase();
  if (payload.valence === 'negative') return payload.intensity >= 0.7 ? 'gentle_steadying' : 'warm_supportive';
  if (style === 'celebratory_burst') return 'bright_energized';
  if (style === 'poetic_observation') return 'soft_reflective';
  if (style === 'purpose_work_affirmation' || style === 'achievement_statement') return 'grounded_proud';
  if (style === 'recovery_statement') return 'steady_reassuring';
  return payload.valence === 'positive' ? 'warm_affirming' : 'steady_neutral';
}

function deriveSemanticFrame(payload) {
  const signals = payload.presentationSignals || {};
  const style = safeStr(payload.expressionStyle || '').toLowerCase();
  if (signals.purposeWorkAffirmation) return 'purpose_alignment';
  if (style === 'achievement_statement') return 'achievement';
  if (signals.environmentalAppreciation || style === 'poetic_observation') return 'aesthetic_appreciation';
  if (signals.recoveryPositive) return 'recovery_positive';
  if (signals.lifeAppraisal) return 'life_appraisal';
  if (payload.valence === 'positive' && ['gratitude','contentment','satisfaction','calmness','serenity','relief'].includes(safeStr(payload.primaryEmotion))) return 'grounded_positive';
  if (payload.valence === 'positive') return 'upward_positive';
  if (payload.valence === 'negative') return 'support_need';
  return 'plain_statement';
}

function deriveConversationPlan(payload, priorState = {}) {
  const nuance = payload.nuanceProfile || createNuance();
  const archetype = BEHAVIOR_ARCHETYPES[nuance.archetype] || BEHAVIOR_ARCHETYPES.clarify;
  const fallbackArchetype = BEHAVIOR_ARCHETYPES[nuance.fallbackArchetype] || BEHAVIOR_ARCHETYPES.ground;
  const signals = payload.presentationSignals || detectPresentationSignals('');
  const lowQuestion = nuance.questionPressure === 'low' || nuance.questionPressure === 'none';
  const repeatedArchetype = num(priorState.sameArchetypeCount, 0) >= 2;
  const intense = payload.intensity >= 0.82;
  const askAllowed = !(intense && lowQuestion) && nuance.questionPressure !== 'none' && !signals.asksForRelief;
  const shouldSuppressMenus = payload.intensity >= 0.6 || nuance.loopRisk === 'high' || signals.mentionsLooping || repeatedArchetype;
  const shouldPreferReflection = ['witness', 'soothe', 'repair', 'reconnect', 'meaning_make'].includes(nuance.conversationNeed) || signals.shortBurst;
  const shouldDelaySolutioning = ['witness', 'soothe', 'repair'].includes(nuance.conversationNeed) || signals.asksForRelief;
  const supportLockBias = nuance.supportLockBias === 'strong' || shouldSuppressMenus || nuance.transitionReadiness === 'low'
    ? 'strong'
    : nuance.supportLockBias;

  let questionStyle = askAllowed ? archetype.questionStyle : 'defer_question';
  if (signals.asksForDirectness && askAllowed) questionStyle = 'single_direct_question';
  if (signals.requestsAction && askAllowed) questionStyle = 'action_gate';

  let followupVariants = uniq(nuance.followupVariants || []);
  if (repeatedArchetype || signals.mentionsLooping) {
    followupVariants = uniq(['state_shift_reflection', 'ground_then_narrow', ...followupVariants]);
  }
  if (signals.asksForDirectness) {
    followupVariants = uniq(['direct_answer_then_one_question', ...followupVariants]);
  }
  if (signals.narrativeDensity >= 2) {
    followupVariants = uniq(['narrative_reflection', ...followupVariants]);
  }

  return {
    archetype: nuance.archetype,
    fallbackArchetype: nuance.fallbackArchetype,
    openingStyle: archetype.openingStyle,
    fallbackOpeningStyle: fallbackArchetype.openingStyle,
    questionStyle,
    askAllowed,
    questionPressure: nuance.questionPressure,
    mirrorDepth: nuance.mirrorDepth,
    transitionReadiness: nuance.transitionReadiness,
    transitionTargets: nuance.transitionTargets,
    followupVariants,
    antiLoopShift: repeatedArchetype || signals.mentionsLooping ? 'force_variant_or_grounding_shift' : nuance.antiLoopShift,
    allowsActionShift: !!archetype.allowsActionShift && nuance.transitionReadiness !== 'low',
    shouldSuppressMenus,
    shouldPreferReflection,
    shouldDelaySolutioning,
    supportLockBias,
    recommendedDepth: nuance.transitionReadiness === 'low' ? 'stay_with_emotion' : 'move_when_user_signals_ready',
    expressionStyle: payload.expressionStyle,
    deliveryTone: payload.deliveryTone,
    semanticFrame: payload.semanticFrame,
    responseFamily: payload.valence === 'positive' ? (payload.semanticFrame === 'achievement' || payload.semanticFrame === 'purpose_alignment' ? 'earned_affirmation' : (payload.semanticFrame === 'aesthetic_appreciation' ? 'reflective_mirroring' : 'warm_affirmation')) : 'gentle_presence'
  };
}

function deriveSupportFlags(payload, text) {
  const body = lower(text);
  const isThreat = ['threat', 'distress', 'self_evaluative'].includes(payload.emotionCluster);
  const isStuck = /stuck|again|same thing|loop|repeating|back to the same/i.test(safeStr(text));
  const nuance = payload.nuanceProfile || createNuance();
  const signals = payload.presentationSignals || detectPresentationSignals(text);

  return {
    needsStabilization: payload.intensity >= 0.65 || isThreat,
    needsClarification: ['uncertain', 'resistance'].includes(payload.emotionCluster) || nuance.conversationNeed === 'clarify',
    needsContainment: ['aversion', 'threat'].includes(payload.emotionCluster) || nuance.conversationNeed === 'boundary',
    needsConnection: ['relational', 'distress', 'affiliative'].includes(payload.emotionCluster) || nuance.conversationNeed === 'reconnect',
    needsForwardMotion: ['drive', 'uplift', 'low_activation'].includes(payload.emotionCluster) || nuance.conversationNeed === 'channel' || isStuck,
    needsWitnessing: nuance.conversationNeed === 'witness',
    needsRepair: nuance.conversationNeed === 'repair',
    prefersDirectness: signals.asksForDirectness || signals.requestsAction,
    asksForHelp: signals.asksForHelp,
    asksForRelief: signals.asksForRelief,
    narrativePresentation: signals.narrativeDensity >= 2,
    delayQuestions: nuance.questionPressure === 'low' || nuance.questionPressure === 'none',
    shouldSuppressMenus: !!payload.conversationPlan?.shouldSuppressMenus,
    mentionsLooping: /loop|looping|again and again|same response|back to the same/i.test(body)
  };
}

function deriveRouteHints(payload) {
  const hints = [];
  const c = payload.emotionCluster;
  const i = payload.intensity;
  const nuance = payload.nuanceProfile || createNuance();

  if (c === 'threat' || c === 'distress') hints.push('psych_support_bridge', 'state_spine_stabilize');
  if (c === 'uncertain') hints.push('clarity_structuring_bridge');
  if (c === 'resistance') hints.push('gentle_challenge_bridge');
  if (c === 'curious' || c === 'reflective') hints.push('reflective_depth_bridge');
  if (c === 'uplift' || c === 'drive') hints.push('momentum_building');
  if (c === 'affiliative' || c === 'relational') hints.push('connection_preserve');
  if (c === 'aversion') hints.push('boundary_mode');
  if (nuance.conversationNeed === 'repair') hints.push('repair_bridge');
  if (nuance.conversationNeed === 'witness') hints.push('presence_hold');
  if (nuance.transitionReadiness === 'low') hints.push('delay_solutioning');
  if (nuance.loopRisk === 'high') hints.push('anti_loop_transition_required');
  if (i >= 0.7) hints.push('fallback_suppression');
  return uniq(hints);
}

function deriveContinuity(payload, priorState = {}) {
  const prevPrimary = safeStr(priorState.primaryEmotion || priorState.dominantEmotion || '');
  const prevSupport = safeStr(priorState.supportModeCandidate || priorState.lastSupportMode || '');
  const prevArchetype = safeStr(priorState.archetype || priorState.lastArchetype || '');
  const prevNoProgress = num(priorState.noProgressTurnCount, 0);
  const prevSameEmotion = num(priorState.sameEmotionCount, 0);
  const prevSameSupport = num(priorState.sameSupportModeCount, 0);
  const prevSameArchetype = num(priorState.sameArchetypeCount, 0);
  const prevFallback = num(priorState.repeatedFallbackCount, 0);

  const sameEmotion = prevPrimary && prevPrimary === payload.primaryEmotion;
  const sameSupport = prevSupport && prevSupport === payload.supportModeCandidate;
  const sameArchetype = prevArchetype && prevArchetype === payload.nuanceProfile?.archetype;

  const sameEmotionCount = sameEmotion ? prevSameEmotion + 1 : 0;
  const sameSupportModeCount = sameSupport ? prevSameSupport + 1 : 0;
  const sameArchetypeCount = sameArchetype ? prevSameArchetype + 1 : 0;
  const noProgressTurnCount = (sameEmotion && sameSupport) ? prevNoProgress + 1 : 0;
  const repeatedFallbackCount = prevFallback;

  const routeExhaustion = sameEmotionCount >= 2 && sameSupportModeCount >= 2 && noProgressTurnCount >= 2;
  const fallbackSuppression = payload.intensity >= 0.65 || routeExhaustion || repeatedFallbackCount >= 1 || sameArchetypeCount >= 2;
  const needsNovelMove = routeExhaustion || noProgressTurnCount >= 2 || repeatedFallbackCount >= 2 || sameArchetypeCount >= 3;

  return {
    previousPrimaryEmotion: prevPrimary || null,
    previousSupportMode: prevSupport || null,
    previousArchetype: prevArchetype || null,
    stateShift: prevPrimary && payload.primaryEmotion && prevPrimary !== payload.primaryEmotion ? 'shifted' : 'stable_or_unknown',
    sameEmotionCount,
    sameSupportModeCount,
    sameArchetypeCount,
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
      volatility: payload.emotionalVolatility,
      archetype: payload.nuanceProfile?.archetype,
      conversationNeed: payload.nuanceProfile?.conversationNeed,
      loopRisk: payload.nuanceProfile?.loopRisk,
      supportLockRecommended: !!payload.conversationPlan?.shouldSuppressMenus,
      supportLockBias: payload.conversationPlan?.supportLockBias,
      presentationSignals: payload.presentationSignals
    },
    chatEngine: {
      routeBias: payload.routeBias,
      fallbackSuppression: payload.fallbackSuppression,
      needsNovelMove: payload.needsNovelMove,
      routeHints: payload.routeHints,
      askAllowed: !!payload.conversationPlan?.askAllowed,
      shouldSuppressMenus: !!payload.conversationPlan?.shouldSuppressMenus,
      antiLoopShift: payload.conversationPlan?.antiLoopShift,
      supportLockBias: payload.conversationPlan?.supportLockBias,
      followupVariants: payload.conversationPlan?.followupVariants || [],
      presentationSignals: payload.presentationSignals,
      expressionStyle: payload.expressionStyle,
      deliveryTone: payload.deliveryTone,
      semanticFrame: payload.semanticFrame
    },
    supportResponse: {
      supportModeCandidate: payload.supportModeCandidate,
      primaryEmotion: payload.primaryEmotion,
      secondaryEmotion: payload.secondaryEmotion,
      tertiaryEmotion: payload.tertiaryEmotion,
      intensity: payload.intensity,
      confidence: payload.confidence,
      nuanceProfile: payload.nuanceProfile,
      conversationPlan: payload.conversationPlan,
      presentationSignals: payload.presentationSignals,
      expressionStyle: payload.expressionStyle,
      deliveryTone: payload.deliveryTone,
      semanticFrame: payload.semanticFrame
    },
    sitebridge: {
      summary: `${payload.primaryEmotion || 'unknown'} / ${payload.emotionCluster} / ${payload.routeBias}`,
      confidence: payload.confidence
    },
    affectEngine: {
      tone: payload.valence === 'negative' ? 'gentle_regulated' : 'warm_attuned',
      volatility: payload.emotionalVolatility,
      intensity: payload.intensity,
      mirrorDepth: payload.conversationPlan?.mirrorDepth || 'medium',
      followupStyle: payload.nuanceProfile?.followupStyle || 'reflective'
    },
    tts: {
      prosodyBias: payload.valence === 'negative' ? 'slower_steadier' : 'natural_warm',
      caution: payload.intensity >= 0.8,
      pacingBias: payload.nuanceProfile?.questionPressure === 'none' ? 'slow_grounding' : 'natural_regulated'
    }
  };
}

function analyzeEmotionRoute(input = {}, priorState = {}) {
  const payload = basePayload();
  const text = safeStr(input.text || input.message || input.userText || '');
  payload.input.textLength = text.length;
  payload.input.hasPriorState = !!priorState && Object.keys(priorState || {}).length > 0;
  payload.inputText = text;

  payload.presentationSignals = detectPresentationSignals(text);

  const scores = analyzeEmotionText(text);
  payload.scores = Object.fromEntries(
    Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v)])
  );

  const { ranked, primary, secondary, tertiary, confidence } = deriveDominance(scores);
  payload.rankedEmotions = ranked;
  payload.primaryEmotion = primary;
  payload.secondaryEmotion = secondary;
  payload.tertiaryEmotion = tertiary;
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
  payload.nuanceProfile = deriveNuanceProfile(primary, secondary, text, priorState);
  payload.expressionStyle = deriveExpressionStyle(payload);
  payload.deliveryTone = deriveDeliveryTone(payload);
  payload.semanticFrame = deriveSemanticFrame(payload);
  payload.conversationPlan = deriveConversationPlan(payload, priorState);

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
  archetypes: BEHAVIOR_ARCHETYPES,
  analyzeEmotionRoute
};

module.exports = {
  VERSION,
  BEHAVIOR_ARCHETYPES,
  EMOTION_DEFS,
  analyzeEmotionRoute,
  emotionRouteGuard
};

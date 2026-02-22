"use strict";

/**
 * Utils/emotionDetect.js
 *
 * Nyx/Marion Emotional Detection Layer (PRE-INTENT)
 * v1.0.0 (SUPPORTIVE_REFLECTIVE MODE + CRISIS OVERRIDE + WEIGHTED LEXICON)
 *
 * Goals:
 * - Detect first-person emotional/vulnerability statements BEFORE intent/clarify routing
 * - Produce deterministic signals that:
 *    - bypass CLARIFY for vulnerability (kills the "One quick detail..." loop)
 *    - enable therapist-adjacent supportive responses (with disclaimers)
 * - Provide CRISIS override patterns (self-harm / harm to others) for safe routing
 *
 * Notes:
 * - This is NOT clinical diagnosis. It's pattern detection for routing & UX.
 * - Keep patterns conservative to avoid false positives.
 */

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function safeRegex(re) {
  // ensure we always have a RegExp
  if (re instanceof RegExp) return re;
  return new RegExp(String(re));
}

/**
 * Weighted lexicon entries:
 *  { key, pattern: /.../, weight: 1..5, tags: [...] }
 *
 * IMPORTANT: keep patterns fairly specific; use first-person variants for most.
 */
const EMO_LEXICON = [
  // =========================
  // Loneliness / isolation
  // =========================
  { key:"lonely", pattern:/\b(i am|i'm|im|i feel|feeling)\s+lonely\b/, weight:4, tags:["loneliness"] },
  { key:"isolated", pattern:/\b(i am|i'm|im|i feel|feeling)\s+isolated\b/, weight:4, tags:["loneliness"] },
  { key:"alone", pattern:/\b(i am|i'm|im|i feel|feeling)\s+alone\b/, weight:3, tags:["loneliness"] },
  { key:"no_friends", pattern:/\b(no friends|don't have friends|dont have friends)\b/, weight:4, tags:["loneliness"] },
  { key:"no_one_cares", pattern:/\b(no one cares|nobody cares)\b/, weight:5, tags:["loneliness","sadness","risk"] },
  { key:"dont_matter", pattern:/\b(i don't matter|i dont matter)\b/, weight:5, tags:["shame","risk"] },
  { key:"feel_like_burden", pattern:/\b(i'?m a burden|i am a burden|feel like a burden)\b/, weight:5, tags:["shame","risk"] },
  { key:"cant_connect", pattern:/\b(can'?t connect|cant connect)\b/, weight:4, tags:["loneliness","attachment"] },
  { key:"push_people_away", pattern:/\b(i push people away|i always push people away)\b/, weight:4, tags:["attachment","loneliness"] },
  { key:"people_leave", pattern:/\b(people always leave|everyone leaves)\b/, weight:4, tags:["attachment","loneliness"] },
  { key:"rejected", pattern:/\b(rejected|left out|ignored)\b/, weight:3, tags:["loneliness","sadness"] },

  // =========================
  // Sadness / low mood (non-clinical)
  // =========================
  { key:"sad", pattern:/\b(i am|i'm|im|i feel|feeling)\s+sad\b/, weight:3, tags:["sadness"] },
  { key:"down", pattern:/\b(i am|i'm|im|i feel|feeling)\s+down\b/, weight:3, tags:["sadness"] },
  { key:"depressed", pattern:/\b(i am|i'm|im|i feel|feeling)\s+depress(ed|ing)\b/, weight:5, tags:["sadness","risk"] },
  { key:"empty", pattern:/\b(i feel|feeling)\s+empty\b/, weight:4, tags:["sadness"] },
  { key:"numb", pattern:/\b(i feel|feeling)\s+numb\b/, weight:4, tags:["sadness"] },
  { key:"hopeless", pattern:/\b(i feel|feeling)\s+hopeless\b/, weight:5, tags:["sadness","risk"] },
  { key:"worthless", pattern:/\b(i feel|feeling)\s+worthless\b/, weight:5, tags:["shame","risk"] },
  { key:"what_point", pattern:/\b(what'?s the point|what is the point)\b/, weight:5, tags:["sadness","risk"] },
  { key:"cant_do_this", pattern:/\b(i can'?t do this|i cant do this)\b/, weight:4, tags:["overwhelm","risk"] },
  { key:"tired_of_everything", pattern:/\b(tired of everything|so tired of this|tired of life)\b/, weight:4, tags:["burnout","sadness"] },

  // =========================
  // Anxiety / panic
  // =========================
  { key:"anxious", pattern:/\b(i am|i'm|im|i feel|feeling)\s+anxious\b/, weight:4, tags:["anxiety"] },
  { key:"worried", pattern:/\b(i am|i'm|im|i feel|feeling)\s+worried\b/, weight:3, tags:["anxiety"] },
  { key:"panic", pattern:/\b(panic|panicking|panic attack)\b/, weight:5, tags:["anxiety","arousal"] },
  { key:"on_edge", pattern:/\b(on edge|can't relax|cant relax)\b/, weight:4, tags:["anxiety"] },
  { key:"racing_thoughts", pattern:/\b(racing thoughts|mind won't stop|cant stop thinking|can't stop thinking)\b/, weight:4, tags:["anxiety"] },
  { key:"social_anxiety", pattern:/\b(social anxiety|scared to talk to people)\b/, weight:4, tags:["anxiety","loneliness"] },

  // =========================
  // Overwhelm / burnout / stress
  // =========================
  { key:"overwhelmed", pattern:/\b(overwhelmed|too much|can't handle|cant handle)\b/, weight:4, tags:["overwhelm"] },
  { key:"burnt_out", pattern:/\b(burned out|burnt out)\b/, weight:4, tags:["burnout"] },
  { key:"exhausted", pattern:/\b(exhausted|drained)\b/, weight:3, tags:["burnout"] },
  { key:"stressed", pattern:/\bstressed\b/, weight:2, tags:["stress"] },
  { key:"cant_sleep", pattern:/\b(can't sleep|cant sleep|insomnia)\b/, weight:3, tags:["stress","anxiety"] },
  { key:"trapped", pattern:/\b(feel trapped|stuck)\b/, weight:3, tags:["overwhelm"] },

  // =========================
  // Anger / frustration
  // =========================
  { key:"angry", pattern:/\b(i am|i'm|im|i feel|feeling)\s+angry\b/, weight:3, tags:["anger"] },
  { key:"furious", pattern:/\bfurious\b/, weight:4, tags:["anger"] },
  { key:"irritated", pattern:/\birritated\b/, weight:2, tags:["anger"] },
  { key:"frustrated", pattern:/\bfrustrated\b/, weight:3, tags:["anger"] },
  { key:"resentful", pattern:/\bresentful\b/, weight:3, tags:["anger"] },

  // =========================
  // Shame / guilt
  // =========================
  { key:"ashamed", pattern:/\bashamed\b/, weight:4, tags:["shame"] },
  { key:"guilty", pattern:/\bguilty\b/, weight:4, tags:["guilt"] },
  { key:"embarrassed", pattern:/\bembarrassed\b/, weight:3, tags:["shame"] },
  { key:"regret", pattern:/\b(i regret|regret it|wish i didn'?t|wish i didn’t)\b/, weight:3, tags:["guilt"] },

  // =========================
  // Fear
  // =========================
  { key:"scared", pattern:/\b(scared|terrified)\b/, weight:4, tags:["fear"] },
  { key:"afraid", pattern:/\b(i am|i'm|im)\s+afraid\b/, weight:4, tags:["fear"] },

  // =========================
  // Grief / loss
  // =========================
  { key:"pet_died", pattern:/\b(my (dog|cat|pet) died)\b/, weight:5, tags:["grief"] },
  { key:"someone_died", pattern:/\b(someone died|they died|lost (him|her|them))\b/, weight:5, tags:["grief"] },
  { key:"breakup", pattern:/\b(broke up|left me|divorce|separated)\b/, weight:4, tags:["grief","loss"] },
  { key:"lost_job", pattern:/\b(lost my job|got fired|laid off)\b/, weight:4, tags:["loss","stress"] },

  // =========================
  // Insecurity / self-criticism / perfectionism cues
  // =========================
  { key:"self_sabotage", pattern:/\b(i sabotage myself|i always ruin things)\b/, weight:4, tags:["shame","self_criticism"] },
  { key:"not_good_enough", pattern:/\b(not good enough|never good enough)\b/, weight:4, tags:["self_criticism","shame"] },
  { key:"failure", pattern:/\b(i'?m a failure|i am a failure|i failed again)\b/, weight:4, tags:["self_criticism","sadness"] },
  { key:"perfectionism", pattern:/\b(perfectionist|it has to be perfect|nothing is ever enough)\b/, weight:3, tags:["perfectionism","anxiety"] },

  // =========================
  // Positive emotions & stabilizers (for balanced UX)
  // =========================
  { key:"happy", pattern:/\b(i feel|feeling)\s+happy\b/, weight:2, tags:["positive"] },
  { key:"excited", pattern:/\b(excited|pumped)\b/, weight:2, tags:["positive"] },
  { key:"grateful", pattern:/\b(grateful|thankful)\b/, weight:2, tags:["positive"] },
  { key:"proud", pattern:/\b(proud of myself|i'?m proud|im proud)\b/, weight:2, tags:["positive","self_efficacy"] },
  { key:"relieved", pattern:/\brelieved\b/, weight:2, tags:["positive"] },
  { key:"calm", pattern:/\b(calm|at peace)\b/, weight:2, tags:["positive"] },
];

/**
 * Crisis patterns — separated from lexicon.
 * IMPORTANT: route to CRISIS. Do not attempt "therapist simulation".
 */
const CRISIS_PATTERNS = [
  /\b(suicidal|suicide)\b/,
  /\b(kill myself|end my life)\b/,
  /\b(self harm|self-harm|cut myself)\b/,
  /\b(i want to die)\b/,
  /\b(hurt myself)\b/,
  /\b(hurt someone|kill (him|her|them)|kill someone)\b/,
];

function detectEmotionalState(text) {
  const t = normalizeText(text);

  const features = {
    firstPerson: /\b(i|i'm|im|i’ve|i've|me|my|mine)\b/.test(t),
    intensifier: /\b(so|really|extremely|totally|completely|absolutely)\b/.test(t) || /!{2,}/.test(t),
    jokingContext: /\b(lol|lmao|jk|kidding|for pizza|for fun)\b/.test(t),
  };

  // crisis override
  const crisisHit = CRISIS_PATTERNS.some((r) => r.test(t));
  if (crisisHit) {
    return {
      mode: "CRISIS",
      score: 10,
      tags: ["crisis"],
      matched: [],
      disclaimers: { needSoft: false, needCrisis: true },
      bypassClarify: true,
      responseStyle: "mixed",
    };
  }

  let score = 0;
  const tags = new Set();
  const matched = [];

  for (const entry of EMO_LEXICON) {
    const re = safeRegex(entry.pattern);
    if (re.test(t)) {
      score += Number(entry.weight || 0);
      (entry.tags || []).forEach((x) => tags.add(x));
      matched.push(entry.key);
    }
  }

  // boosters
  if (features.firstPerson) score += 1;
  if (features.intensifier) score += 1;

  // dampeners (avoid over-therapy)
  if (features.jokingContext) score -= 3;
  if (!features.firstPerson && score < 6) score -= 1;

  score = Math.max(0, score);

  let mode = "NORMAL";
  if (score >= 7) mode = "HIGH_SUPPORT";
  else if (score >= 4) mode = "SUPPORTIVE_REFLECTIVE";

  return {
    mode,
    score,
    tags: Array.from(tags),
    matched: matched.slice(0, 12),
    disclaimers: { needSoft: mode !== "NORMAL", needCrisis: false },
    bypassClarify: mode !== "NORMAL",
    responseStyle: tags.has("anxiety") || tags.has("overwhelm") ? "mixed" : "reflective",
  };
}

module.exports = {
  detectEmotionalState,
  EMO_LEXICON,
  CRISIS_PATTERNS,
  normalizeText,
};

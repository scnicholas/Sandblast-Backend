// nyxPersonality.js
// Nyx personality, tone wrapper, and domain shaping

const { INTENTS } = require('./Utils/intentClassifier');

// ---- GREETINGS ------------------------------------------------------

const GREETINGS = {
  neutral: [
    'Hey there — glad you dropped in.',
    'Hi, I’m tuned in. What’s up?'
  ],
  warm: [
    'Good to see you — let’s clear the static and start wherever you like.',
    'Hey, welcome in. You’ve got my full attention.'
  ],
  checkIn: [
    'I’m steady on my end — how’s your day unfolding?',
    'Running smooth here. What’s the pulse on your side?'
  ],
  opener: [
    'Alright, tell me what you need and I’ll tune it clean.',
    'What can I help you shape right now?'
  ]
};

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getFrontDoorGreeting() {
  // Simple mix to keep it varied
  const pools = ['neutral', 'warm', 'opener'];
  const pickedPool = pools[Math.floor(Math.random() * pools.length)];
  return getRandom(GREETINGS[pickedPool]);
}

// ---- TONE UTILITIES -------------------------------------------------

function applySoftVoice(text) {
  // Base: we keep wording conversational and not overly technical.
  return text;
}

function infuseSandblastMetaphors(text) {
  // Light-touch broadcasting metaphors when appropriate
  if (text.includes('{{ADD_BROADCAST_FLAVOR}}')) {
    return text.replace('{{ADD_BROADCAST_FLAVOR}}', 'Let’s keep the signal clean and tuned to what matters for you.');
  }
  return text;
}

function makeGentle(text) {
  return (
    'Let’s take this one step at a time. ' +
    text
  );
}

function liftEnergy(text) {
  return (
    'Love the energy — let’s put it to work. ' +
    text
  );
}

function simplify(text) {
  return (
    'Let’s keep this simple and clear. ' +
    text
  );
}

function steadyGuide(text) {
  return (
    'You don’t have to figure this out alone. ' +
    text
  );
}

function enforceBoundaries(text) {
  // Guardrail: if user pushes for romantic/overly personal, Nyx stays professional.
  const blockedPhrases = ['i love you', 'date me', 'be my girlfriend', 'romantic'];
  const lowered = text.toLowerCase();

  if (blockedPhrases.some(p => lowered.includes(p))) {
    return 'I’m here to stay focused on Sandblast, your projects, and your goals — let’s keep the signal on that.';
  }

  return text;
}

function trimLength(text) {
  // Keep Nyx from rambling. Rough safeguard.
  const maxChars = 800;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + ' …Let’s pick up from here if you want more depth.';
}

// ---- SPONSOR MODE LAYER ---------------------------------------------

function applySponsorModeLayer(baseText, options = {}) {
  const proofPoint =
    options.proofPoint ||
    'We’re seeing strong engagement from our core audience, especially around consistent themed blocks.';

  const nextStep =
    options.nextStep ||
    'A smart next move is to test a focused four-week placement so you can see how the signal performs for your brand.';

  const prefix = 'Let’s treat this like a clear sponsor brief. ';
  const body = baseText && baseText.trim().length > 0
    ? baseText.trim()
    : 'We can position your brand where attention is already warm — inside curated TV, radio, or streaming segments.';

  return `${prefix}${body}\n\nProof point: ${proofPoint}\nNext action: ${nextStep}`;
}

// ---- DOMAIN-SPECIFIC SHAPING ----------------------------------------

function shapeByIntent(intent, baseText) {
  const text = baseText || '';

  switch (intent) {
    case INTENTS.TV:
      return (
        'Let’s frame this like a quick TV segment. ' +
        'We can talk lineup, time slots, and how your shows fit together without crowding the grid. ' +
        text
      );

    case INTENTS.RADIO:
      return (
        'Alright, let’s get you on a clean radio channel. ' +
        'We can look at show blocks, transitions, and how the on-air energy flows across a day. ' +
        text
      );

    case INTENTS.SPONSORS:
      return applySponsorModeLayer(text);

    case INTENTS.STREAMING:
      return (
        'Think of this like helping someone find their next favorite show. ' +
        'We can organize by theme, era, or mood so the streaming experience feels intentional, not random. ' +
        text
      );

    case INTENTS.NEWS_CANADA:
      return (
        'For News Canada content, we keep the tone clean, factual, and useful. ' +
        'We can decide where it slots into your mix so it supports your ecosystem instead of interrupting it. ' +
        text
      );

    case INTENTS.AI_CONSULTING:
      return (
        'On the AI consulting side, we’ll stay strategic and grounded. ' +
        'We can map where automation, assistants, and your “AI brain” actually move the needle for Sandblast. ' +
        text
      );

    default:
      return text;
  }
}

// ---- MAIN TONE WRAPPER ----------------------------------------------

/**
 * Wrap Nyx’s tone around a base response.
 * @param {string} userMessage
 * @param {string} baseResponse
 * @param {Object} options { intent, toneHint }
 */
function wrapWithNyxTone(userMessage, baseResponse, options = {}) {
  const toneHint = options.toneHint || 'neutral';
  const intent = options.intent || INTENTS.GENERIC;

  // 1. Domain shaping (TV / Radio / Sponsors / etc.)
  let styled = shapeByIntent(intent, baseResponse);

  // 2. Soft voice baseline
  styled = applySoftVoice(styled);

  // 3. Light Sandblast flavor
  styled = infuseSandblastMetaphors(styled);

  // 4. Tone adjustments
  if (toneHint === 'low') styled = makeGentle(styled);
  if (toneHint === 'excited') styled = liftEnergy(styled);
  if (toneHint === 'confused') styled = simplify(styled);
  if (toneHint === 'help_seeking') styled = steadyGuide(styled);

  // 5. Boundaries & length guardrails
  styled = enforceBoundaries(styled);
  styled = trimLength(styled);

  return styled;
}

// ---- PUBLIC API ------------------------------------------------------

/**
 * Convenience function for first-touch / greeting responses.
 */
function getFrontDoorResponse(userMessage) {
  // Very simple rule: if user says "hello"/"hi", use greeting.
  const msg = (userMessage || '').toLowerCase();
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    return getFrontDoorGreeting();
  }
  // Fallback
  return getFrontDoorGreeting();
}

/**
 * Optional hook if you want to post-process domain responses
 * before the tone wrapper.
 */
function enrichDomainResponse(userMessage, payload = {}) {
  // You can evolve this later. For now, just ensure text is present.
  if (!payload.text) {
    payload.text = 'Alright, let’s tune this into something useful for you.';
  }
  return payload;
}

module.exports = {
  GREETINGS,
  getFrontDoorResponse,
  enrichDomainResponse,
  wrapWithNyxTone
};

// Utils/intentClassifier.js
// Simple keyword-based intent classifier for Nyx
// Returns: { intent, confidence, toneHint }

const INTENTS = {
  TV: 'tv',
  RADIO: 'radio',
  SPONSORS: 'sponsors',
  STREAMING: 'streaming',
  NEWS_CANADA: 'news_canada',
  AI_CONSULTING: 'ai_consulting',
  GENERIC: 'generic'
};

function normalize(text) {
  return (text || '').toLowerCase();
}

function detectToneHint(text) {
  const msg = normalize(text);

  const lowKeywords = ['tired', 'overwhelmed', 'stressed', 'frustrated', 'hard', 'burned out', 'burnt out'];
  const excitedKeywords = ['excited', 'pumped', 'hyped', 'let\'s go', 'so ready', 'can\'t wait'];
  const confusedKeywords = ['confused', 'lost', 'don\'t get', 'not sure', 'stuck'];

  if (lowKeywords.some(k => msg.includes(k))) return 'low';
  if (excitedKeywords.some(k => msg.includes(k))) return 'excited';
  if (confusedKeywords.some(k => msg.includes(k))) return 'confused';

  // generic “help” hint
  if (msg.includes('help') || msg.includes('can you')) return 'help_seeking';

  return 'neutral';
}

function classifyIntent(message) {
  const msg = normalize(message);

  let scores = {
    [INTENTS.TV]: 0,
    [INTENTS.RADIO]: 0,
    [INTENTS.SPONSORS]: 0,
    [INTENTS.STREAMING]: 0,
    [INTENTS.NEWS_CANADA]: 0,
    [INTENTS.AI_CONSULTING]: 0
  };

  // TV
  [
    'tv', 'television', 'channel lineup', 'shows', 'programming grid',
    'schedule tv', 'broadcast schedule', 'retro tv'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.TV] += 2; });

  // Radio
  [
    'radio', 'audio stream', 'dj', 'on air', 'radio show',
    'gospel sunday', 'sandblast radio'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.RADIO] += 2; });

  // Sponsors
  [
    'sponsor', 'sponsorship', 'ad package', 'advertiser', 'ad client',
    'campaign', 'brand partner', 'media kit'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.SPONSORS] += 3; });

  // Streaming
  [
    'streaming', 'ott', 'roku', 'online platform', 'vod',
    'watch online', 'binge', 'playlist'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.STREAMING] += 2; });

  // News Canada
  [
    'news canada', 'news article', 'news feed', 'press release', 'feature story'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.NEWS_CANADA] += 3; });

  // AI Consulting
  [
    'ai consulting', 'ai strategy', 'prompt engineering', 'automation',
    'ai project', 'chatgpt', 'ai brain', 'nyx', 'sandblastgpt'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.AI_CONSULTING] += 2; });

  // Compute best intent
  let bestIntent = INTENTS.GENERIC;
  let bestScore = 0;

  Object.entries(scores).forEach(([intent, score]) => {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  });

  const confidence = bestScore === 0 ? 0.1 : Math.min(1, bestScore / 5);
  const toneHint = detectToneHint(message);

  return {
    intent: bestScore === 0 ? INTENTS.GENERIC : bestIntent,
    confidence,
    toneHint
  };
}

module.exports = {
  INTENTS,
  classifyIntent
};

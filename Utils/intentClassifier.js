// Utils/intentClassifier.js
// Expanded keyword-based intent classifier for Nyx
// Returns: { intent, confidence, toneHint }

const INTENTS = {
  TV: 'tv',
  RADIO: 'radio',
  SPONSORS: 'sponsors',
  STREAMING: 'streaming',
  NEWS_CANADA: 'news_canada',
  AI_CONSULTING: 'ai_consulting',
  GREETING: 'greeting',
  GENERIC: 'generic'
};

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[\n\r]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function detectToneHint(text) {
  const msg = normalize(text);

  const lowKeywords = [
    'tired', 'exhausted', 'overwhelmed', 'stressed', 'frustrated', 'hard',
    'burned out', 'burnt out', 'drained', 'worn out'
  ];
  const excitedKeywords = [
    'excited', 'pumped', 'hyped', 'let s go', 'so ready', 'can t wait',
    'fired up', 'energized'
  ];
  const confusedKeywords = [
    'confused', 'lost', 'don t get', 'not sure', 'stuck', 'no idea',
    'don t understand'
  ];

  if (lowKeywords.some(k => msg.includes(k))) return 'low';
  if (excitedKeywords.some(k => msg.includes(k))) return 'excited';
  if (confusedKeywords.some(k => msg.includes(k))) return 'confused';

  if (msg.includes('help') || msg.includes('can you') || msg.includes('could you')) {
    return 'help_seeking';
  }

  return 'neutral';
}

function classifyIntent(message) {
  const msg = normalize(message);
  const words = msg.split(' ').filter(Boolean);
  const wordCount = words.length;

  // ============================
  // HARD GREETING DETECTION
  // (only very short, clear greetings)
  // ============================
  const simpleGreetingPhrases = [
    'hi',
    'hi nyx',
    'hello',
    'hello nyx',
    'hey',
    'hey nyx',
    'good morning',
    'good afternoon',
    'good evening'
  ];

  const questionGreetingPhrases = [
    'how are you',
    'how s your day',
    'how is your day',
    'how are you nyx'
  ];

  const isSimpleGreeting =
    wordCount > 0 &&
    wordCount <= 5 &&
    simpleGreetingPhrases.some(p => msg === p || msg.startsWith(p + ' '));

  const isQuestionGreeting =
    wordCount > 0 &&
    wordCount <= 7 &&
    questionGreetingPhrases.some(p => msg.includes(p));

  if (isSimpleGreeting || isQuestionGreeting) {
    const toneHint = detectToneHint(message);
    return {
      intent: INTENTS.GREETING,
      confidence: 0.99,
      toneHint
    };
  }

  // ============================
  // MAIN INTENT SCORING
  // ============================
  let scores = {
    [INTENTS.TV]: 0,
    [INTENTS.RADIO]: 0,
    [INTENTS.SPONSORS]: 0,
    [INTENTS.STREAMING]: 0,
    [INTENTS.NEWS_CANADA]: 0,
    [INTENTS.AI_CONSULTING]: 0
  };

  // -------- TV --------
  [
    'tv',
    'television',
    'tv show',
    'tv shows',
    'series',
    'episode',
    'episodes',
    'channel',
    'channel lineup',
    'channel guide',
    'lineup',
    'programme',
    'programming',
    'programming grid',
    'schedule tv',
    'broadcast schedule',
    'broadcast grid',
    'retro tv',
    'classic tv',
    'old shows',
    'reruns',
    'what s on',
    'what is on',
    'tv schedule',
    'tv guide',
    'prime time'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.TV] += 2; });

  [
    'sandblast tv',
    'tv block',
    'tv feed'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.TV] += 3; });

  // -------- Radio --------
  [
    'radio',
    'audio stream',
    'audio only',
    'dj',
    'on air',
    'on air ',
    'radio show',
    'radio host',
    'radio segment',
    'radio station',
    'music block',
    'playlist show',
    'mix show',
    'broadcast audio'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.RADIO] += 2; });

  [
    'gospel sunday',
    'sandblast radio',
    'dj nova'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.RADIO] += 3; });

  // -------- Sponsors / Advertising --------
  [
    'sponsor',
    'sponsorship',
    'ad package',
    'ad packages',
    'advertiser',
    'advertisers',
    'ad client',
    'ad clients',
    'campaign',
    'ad campaign',
    'media buy',
    'brand partner',
    'brand partners',
    'media kit',
    'rate card',
    'ad rates',
    'advertising',
    'ad slot',
    'ad slots',
    'sponsor spot',
    'sponsor spots'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.SPONSORS] += 3; });

  [
    'how do i advertise',
    'run my ad',
    'place an ad',
    'book ad space',
    'book a spot',
    'sponsor a show',
    'sponsor my show'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.SPONSORS] += 4; });

  // -------- Streaming / OTT / VOD --------
  [
    'streaming',
    'ott',
    'roku',
    'fire tv',
    'online platform',
    'online channel',
    'vod',
    'video on demand',
    'watch online',
    'watch on line',
    'binge',
    'playlist',
    'live stream',
    'live streaming',
    'on demand',
    'web player',
    'stream',
    'stream my show',
    'upload my show',
    'upload content'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.STREAMING] += 2; });

  [
    'sandblast channel app',
    'sandblast channel online',
    'sandblast streaming'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.STREAMING] += 3; });

  // -------- News Canada --------
  [
    'news canada',
    'news article',
    'news feed',
    'press release',
    'feature story',
    'news segment',
    'editorial content',
    'news piece'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.NEWS_CANADA] += 3; });

  [
    'how do i run a news canada piece',
    'how do i run news canada content',
    'news canada distribution'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.NEWS_CANADA] += 4; });

  // -------- AI Consulting / Brain / Training --------
  [
    'ai consulting',
    'ai strategy',
    'ai road map',
    'ai roadmap',
    'prompt engineering',
    'prompt design',
    'automation',
    'workflow automation',
    'ai project',
    'chatgpt',
    'openai',
    'ai brain',
    'ai assistant',
    'nyx',
    'sandblastgpt',
    'sandblast gpt',
    'ai workshop',
    'ai training',
    'ai course',
    'ai bootcamp',
    'generative ai',
    'llm',
    'large language model'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.AI_CONSULTING] += 2; });

  [
    'consulting offer',
    'consulting package',
    'corporate training',
    'employment ontario',
    'upskill with ai',
    'career with ai',
    'job search with ai',
    'resume with ai',
    'cover letter with ai'
  ].forEach(k => { if (msg.includes(k)) scores[INTENTS.AI_CONSULTING] += 3; });

  // -------- GENERIC / about Nyx / about Sandblast --------
  let genericScore = 0;

  const aboutNyxOrSandblast = [
    'what can you do',
    'how can you help',
    'what do you do',
    'who are you',
    'what is sandblast',
    'tell me about sandblast',
    'tell me about the channel',
    'what is this channel',
    'explain sandblast',
    'explain this platform'
  ];
  if (aboutNyxOrSandblast.some(k => msg.includes(k))) genericScore += 3;

  const genericHelpKeywords = [
    'i have a question',
    'answer some questions',
    'general question',
    'few questions',
    'help me get started',
    'where do i start',
    'how do i start',
    'show me around',
    'give me an overview'
  ];
  if (genericHelpKeywords.some(k => msg.includes(k))) genericScore += 3;

  const goodbyeKeywords = [
    'bye', 'goodbye', 'see you later', 'talk later', 'signing off', 'log off'
  ];
  if (goodbyeKeywords.some(k => msg.includes(k))) genericScore += 1;

  // ============================
  // Compute best intent
  // ============================
  let bestIntent = INTENTS.GENERIC;
  let bestScore = genericScore; // let generic start with its own score

  Object.entries(scores).forEach(([intent, score]) => {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  });

  const confidence = bestScore === 0 ? 0.1 : Math.min(1, bestScore / 5);
  const toneHint = detectToneHint(message);

  return {
    intent: bestIntent,
    confidence,
    toneHint
  };
}

module.exports = {
  INTENTS,
  classifyIntent
};

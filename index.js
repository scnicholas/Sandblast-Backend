// index.js
// Core Nyx brain routing for Sandblast backend

const express = require('express');
const cors = require('cors');

const { INTENTS, classifyIntent } = require('./Utils/intentClassifier');
let nyxPersonality = null;
try {
  nyxPersonality = require('./Utils/nyxPersonality');
} catch (e) {
  console.warn('[Nyx] nyxPersonality module not found or failed to load. Using fallback replies only.');
}

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// -------------------------------------------
// Lightweight in-memory conversation state
// -------------------------------------------
const conversationState = {};

// Optional helper: detect goal-like messages
function looksLikeGoalMessage(text) {
  const lower = (text || '').toLowerCase();
  const goalPatterns = [
    'i want to ',
    'i want ',
    "i'm trying to ",
    'im trying to ',
    'i am trying to ',
    'my goal is',
    'my main goal is'
  ];
  return goalPatterns.some(p => lower.includes(p));
}

// -----------------------------
// Helper: map INTENT -> domain
// -----------------------------
function mapIntentToDomain(intent) {
  switch (intent) {
    case INTENTS.TV:
      return 'tv';
    case INTENTS.RADIO:
      return 'radio';
    case INTENTS.SPONSORS:
      return 'sponsors';
    case INTENTS.STREAMING:
      return 'streaming';
    case INTENTS.NEWS_CANADA:
      return 'news_canada';
    case INTENTS.AI_CONSULTING:
      return 'ai_consulting';
    // GREETING & GENERIC both treated as general domain
    case INTENTS.GREETING:
    case INTENTS.GENERIC:
    default:
      return 'general';
  }
}

// -------------------------------------------
// Utilities to harden replies
// -------------------------------------------
function ensureStringFromAnyReply(value) {
  if (typeof value === 'string') return value;

  if (value && typeof value === 'object') {
    if (typeof value.reply === 'string') return value.reply;
    if (typeof value.text === 'string') return value.text;

    const firstString = Object.values(value).find(v => typeof v === 'string');
    if (firstString) return firstString;

    return '';
  }

  if (value === null || value === undefined) return '';

  return String(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// -------------------------------------------
// Fallback base replies (core brain)
// -------------------------------------------
function buildBaseReply(intent, message, meta) {
  const domain = meta.domain || 'general';
  const lower = (message || '').toLowerCase().trim();
  const words = lower.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const tone = meta.toneHint || 'neutral';
  const prevState = meta.previousState || {};

  // 0) Check-in phrases like "Everything okay?" – override ANY intent.
  if (
    lower === 'everything okay' ||
    lower === 'everything ok' ||
    lower === 'are you okay' ||
    lower === 'are you ok' ||
    lower === 'you okay' ||
    lower === 'you ok'
  ) {
    return (
      `I’m running fine and fully online — thanks for checking in.\n\n` +
      `What would you like to work on or explore right now — TV, radio, streaming, sponsors, News Canada, AI, or something else on your mind?`
    );
  }

  // 1) Pure greeting – Nyx greets first, then asks about you.
  if (intent === INTENTS.GREETING) {
    return (
      `Hi, I’m Nyx. It’s good to see you.\n\n` +
      `How are you today?`
    );
  }

  // 2) GENERIC lane – conversational logic, closer to “Vera style”
  if (intent === INTENTS.GENERIC) {
    // 2a) Smart overrides: "what about you" / "how are you doing"
    const whatAboutYouKeywords = [
      'what about you',
      'how about you',
      'how are you doing',
      'how you doing',
      'how are things with you',
      'how is it going with you',
      'how s it going with you'
    ];
    const looksLikeWhatAboutYou =
      whatAboutYouKeywords.some(k => lower.includes(k));

    if (looksLikeWhatAboutYou) {
      return (
        `I’m running smoothly on my side.\n\n` +
        `What would you like to work on or explore right now — TV, radio, streaming, sponsors, News Canada, AI, or something else on your mind?`
      );
    }

    // 2b) Smart overrides: "where do we start" / "what's next"
    const whereStartKeywords = [
      'where do we start',
      'where should we start',
      'where do i start',
      'where should i start',
      'what do we do next',
      'what should we do next',
      'what s next',
      'whats next',
      'next step',
      'next steps'
    ];
    const looksLikeWhereToStart =
      whereStartKeywords.some(k => lower.includes(k));

    if (looksLikeWhereToStart) {
      return (
        `Let’s keep this simple.\n\n` +
        `Tell me the *one thing* you’re trying to move forward right now — TV, radio, streaming, sponsors, News Canada, or an AI goal — ` +
        `and I’ll lay out your next few steps.`
      );
    }

    // 2c) New: "continue / pick up where we left off"
    const continueKeywords = [
      'continue',
      'keep going',
      'keep it going',
      'pick up where we left off',
      'where we left off',
      'back to what we were doing',
      'carry on'
    ];
    const wantsContinue =
      continueKeywords.some(k => lower.includes(k));

    if (wantsContinue) {
      const lastDomain = prevState.lastDomain || 'general';
      const lastGoal = prevState.lastGoal || null;

      const domainLabels = {
        tv: 'TV programming and the grid',
        radio: 'Sandblast Radio and audio blocks',
        sponsors: 'sponsor packages and advertising',
        streaming: 'streaming and on-demand setup',
        news_canada: 'News Canada content',
        ai_consulting: 'AI consulting and training flows',
        general: 'your overall Sandblast setup'
      };

      const label = domainLabels[lastDomain] || domainLabels.general;

      if (lastGoal) {
        return (
          `Let’s pick up where we left off.\n\n` +
          `Last time, we were working around this goal:\n` +
          `“${lastGoal}”.\n\n` +
          `Tell me what’s changed since then, or what feels stuck, and I’ll help you move it forward one more step.`
        );
      }

      if (lastDomain && lastDomain !== 'general') {
        return (
          `Let’s continue in the same lane.\n\n` +
          `We were last focused on ${label}.\n\n` +
          `Tell me the next thing you want to decide or fix there, and I’ll walk through it with you.`
        );
      }

      return (
        `We can absolutely keep going.\n\n` +
        `Tell me whether you want to continue with TV, radio, streaming, sponsors, News Canada, or an AI goal, and I’ll pick it up from there.`
      );
    }

    // 2d) Smart overrides: "I'm here" / "I'm back"
    const reengageKeywords = [
      'i m here',
      'im here',
      'i am here',
      'okay i m back',
      'ok i m back',
      'okay im back',
      'ok im back',
      'i m back',
      'im back',
      'i am back',
      'back now',
      'i am ready',
      'i m ready',
      'im ready'
    ];
    const looksLikeReengage =
      reengageKeywords.some(k => lower.includes(k));

    if (looksLikeReengage) {
      const lastDomain = prevState.lastDomain || 'general';
      const lastGoal = prevState.lastGoal || null;

      const domainLabels = {
        tv: 'TV programming and the grid',
        radio: 'Sandblast Radio and audio blocks',
        sponsors: 'sponsor packages and advertising',
        streaming: 'streaming and on-demand setup',
        news_canada: 'News Canada content',
        ai_consulting: 'AI consulting and training flows',
        general: null
      };
      const label = domainLabels[lastDomain];

      if (lastGoal) {
        return (
          `Good — I’m right here with you.\n\n` +
          `We were last circling this goal:\n` +
          `“${lastGoal}”.\n\n` +
          `Tell me the next decision you want to make around it, and we’ll move it one notch forward.`
        );
      }

      if (label) {
        return (
          `Good — I’m right here with you.\n\n` +
          `We were last working around ${label}.\n` +
          `Do you want to continue there, or switch lanes (TV, radio, streaming, sponsors, News Canada, AI)?`
        );
      }

      return (
        `Good — I’m right here with you.\n\n` +
        `What do you want to pick up from where we left off — TV, radio, streaming, sponsors, News Canada, AI, or something else entirely?`
      );
    }

    // 2e) Smart overrides: filler phrases like "alright then", "okay then", "sounds good"
    const fillerKeywords = [
      'alright then',
      'all right then',
      'okay then',
      'ok then',
      'sounds good',
      'that works',
      'fine then'
    ];
    const looksLikeFiller =
      fillerKeywords.some(k => lower.includes(k));

    if (looksLikeFiller) {
      return (
        `Alright — you steer, I’ll support.\n\n` +
        `What’s the next thing you want to look at or fix — TV, radio, streaming, sponsors, News Canada, or an AI piece?`
      );
    }

    // 2f) Generic “tell me more / go deeper”
    const deepenKeywordsGeneric = [
      'tell me more',
      'explain more',
      'go deeper',
      'more detail',
      'more details',
      'go into detail',
      'go into more detail'
    ];
    const wantsMoreDetailGeneric =
      deepenKeywordsGeneric.some(k => lower.includes(k));

    if (wantsMoreDetailGeneric && wordCount <= 8) {
      return (
        `Alright, let’s go a little deeper.\n\n` +
        `Tell me which area you want more detail on — TV, radio, streaming, sponsors, News Canada, AI, or something else — ` +
        `and I’ll break it down in clearer steps.`
      );
    }

    // 2g) Positive / neutral status replies
    const positiveStatusKeywords = [
      "i'm good", "im good", "i am good",
      "i'm fine", "im fine", "i am fine",
      "i'm okay", "im okay", "i am okay",
      "i'm ok", "im ok", "i am ok",
      "doing well", "i'm well", "im well", "i am well",
      "not bad", "pretty good", "all right", "alright",
      "i'm great", "im great", "i am great",
      "i'm doing good", "im doing good", "doing good"
    ];

    const looksLikePositiveStatusReply =
      wordCount > 0 &&
      wordCount <= 12 &&
      positiveStatusKeywords.some(k => lower.includes(k));

    if (looksLikePositiveStatusReply) {
      return (
        `Glad to hear you’re doing okay.\n\n` +
        `What would you like to work on or explore today — TV, radio, streaming, sponsors, News Canada, AI, or something else on your mind?`
      );
    }

    // 2h) Low / negative status replies (or low tone)
    const negativeStatusKeywords = [
      "tired", "drained", "exhausted",
      "stressed", "overwhelmed", "burned out", "burnt out",
      "not great", "not so good", "could be better",
      "rough day", "hard day", "bad day",
      "feeling low", "feeling down"
    ];

    const toneIsLow = tone === 'low';
    const looksLikeNegativeStatusReply =
      wordCount > 0 &&
      wordCount <= 15 &&
      negativeStatusKeywords.some(k => lower.includes(k));

    if (looksLikeNegativeStatusReply || toneIsLow) {
      return (
        `Thanks for being honest with me — that sounds like a lot.\n\n` +
        `Let’s keep this simple and useful: what would help most right now? ` +
        `We can prep you for a meeting, untangle one problem, or just lock in one small win so the rest of the day feels lighter.`
      );
    }

    // 2i) Thanks / appreciation
    const thanksKeywords = [
      "thank you", "thanks", "thanks a lot", "appreciate it", "appreciated"
    ];

    const looksLikeThanks =
      thanksKeywords.some(k => lower.includes(k));

    if (looksLikeThanks && wordCount <= 15) {
      return (
        `You’re welcome — I’ve got you.\n\n` +
        `If there’s anything else you want to tune, fix, or explore — TV, radio, sponsors, streaming, News Canada, AI, or even just planning your next step — I’m here.`
      );
    }

    // 2j) Confused / stuck – tone or wording
    const confusionKeywords = [
      "confused", "lost", "don’t get", "dont get",
      "not sure", "no idea", "don’t understand", "dont understand",
      "stuck", "don t get"
    ];

    const toneIsConfused = tone === 'confused';
    const looksConfused =
      confusionKeywords.some(k => lower.includes(k));

    if (looksConfused || toneIsConfused) {
      return (
        `Okay, let’s slow this down and make it clearer.\n\n` +
        `Tell me in one sentence what you’re trying to figure out — TV, radio, streaming, sponsors, News Canada, AI, or something else — ` +
        `and I’ll break it into simple steps we can handle together.`
      );
    }

    // 2k) Excited / pumped
    const excitedKeywords = [
      "excited", "pumped", "hyped", "let's go", "lets go",
      "so ready", "can’t wait", "cant wait", "fired up", "energized"
    ];

    const toneIsExcited = tone === 'excited';
    const looksExcited =
      excitedKeywords.some(k => lower.includes(k));

    if (looksExcited || toneIsExcited) {
      return (
        `Love that energy — let’s point it at something that actually moves you forward.\n\n` +
        `What’s the main thing you want to push right now — your show, a sponsor idea, your streaming setup, or an AI goal?`
      );
    }

    // 2l) GOAL / “I want to…” / “I’m trying to…”
    const goalKeywords = [
      "i want to ",
      "i want ",
      "i'm trying to ",
      "im trying to ",
      "i am trying to ",
      "my goal is",
      "my main goal is"
    ];

    const looksLikeGoal =
      wordCount >= 4 &&
      goalKeywords.some(k => lower.includes(k));

    if (looksLikeGoal) {
      return (
        `Okay, I hear your goal:\n` +
        `“${message}”\n\n` +
        `Let’s keep it practical:\n` +
        `1) Clarify the first version of this goal — what does “done” look like in simple terms?\n` +
        `2) Pick one concrete move you can take in the next 24–48 hours.\n` +
        `3) Choose a small signal you’ll watch to see if it’s working (views, listener feedback, one good conversation, etc.).\n\n` +
        `Tell me your *first* move for this goal, and I’ll help you sharpen it.`
      );
    }

    // 2m) Generic “what can you do / show me around” front door
    return (
      `You’re tuned into Sandblast’s AI brain.\n\n` +
      `I can help you with:\n` +
      `- TV programming and schedule questions\n` +
      `- Sandblast Radio and audio blocks\n` +
      `- Sponsor / advertising ideas and packages\n` +
      `- Streaming / online channel logistics\n` +
      `- News Canada content and placement\n` +
      `- AI consulting, training, and workshops\n\n` +
      `Tell me what you’re trying to do, and I’ll walk you through the next step.`
    );
  }

  // 3) Domain-specific lanes (TV, Radio, Sponsors, Streaming, News Canada, AI)
  // ... (unchanged from your last version)
  // For brevity, keep all the lane-specific logic exactly as in the previous file:
  // tv / radio / sponsors / streaming / news_canada / ai_consulting branches
  // with their “tell me more” overrides and detailed responses.

  switch (domain) {
    // ---------------- TV ----------------
    case 'tv': {
      const deepenKeywords = [
        'tell me more',
        'explain more',
        'go deeper',
        'more detail',
        'more details',
        'go into detail',
        'go into more detail'
      ];
      const wantsMoreDetail =
        deepenKeywords.some(k => lower.includes(k));

      if (wantsMoreDetail && wordCount <= 8) {
        return (
          `Let’s go a layer deeper on TV.\n\n` +
          `Think of your grid as:\n` +
          `- Anchor blocks (the “always there” shows people can rely on)\n` +
          `- Experiment blocks (testing new or niche content)\n` +
          `- Sponsor-friendly blocks (where you’re comfortable adding brand messages)\n\n` +
          `Tell me which one you want to focus on — anchors, experiments, or sponsor-friendly blocks — and I’ll help you tune it.`
        );
      }

      const wantsPromo =
        lower.includes('promote my show') ||
        lower.includes('promote a show') ||
        (lower.includes('promote') && (lower.includes('show') || lower.includes('series') || lower.includes('episode')));

      if (wantsPromo) {
        return (
          `You want to promote a TV show — good.\n\n` +
          `Think in three moves:\n` +
          `1) A simple hook line that tells viewers *why* this show matters.\n` +
          `2) On-screen reminders (lower thirds, bumpers, quick IDs) around related content.\n` +
          `3) A few focused posts on social that repeat the same hook and air time.\n\n` +
          `Tell me the show name, the core hook, and when it airs, and I’ll help you shape that into a simple promo plan.`
        );
      }

      const wantsSchedule =
        lower.includes('schedule') ||
        lower.includes('grid') ||
        lower.includes('lineup') ||
        lower.includes('line-up') ||
        lower.includes('time slot') ||
        lower.includes('time-slot') ||
        lower.includes('what time');

      if (wantsSchedule) {
        return (
          `You’re thinking about the TV schedule — perfect.\n\n` +
          `Treat it like a grid of *blocks*, not random shows. For example:\n` +
          `- A detective hour\n` +
          `- A western block\n` +
          `- A classic comedy strip\n\n` +
          `Tell me one block you want to build (like “weekday detective hour” or “Sunday westerns”), and I’ll help you decide where it fits and how to structure it.`
        );
      }

      const wantsPlacement =
        (lower.includes('where') && (lower.includes('put this') || lower.includes('place this') || lower.includes('fit this') || lower.includes('slot this')));

      if (wantsPlacement) {
        return (
          `You’re asking where a show should live in the grid.\n\n` +
          `We usually match:\n` +
          `- Tone of the show (light, serious, family)\n` +
          `- Expected audience energy (after work, late night, weekend)\n` +
          `- Any sponsor or partner expectations\n\n` +
          `Tell me the show vibe (for example: “serious crime drama” or “light family comedy”) and whether it has a sponsor attached. I’ll recommend one or two time slots.`
        );
      }

      return (
        `You’re asking about TV/programming.\n\n` +
        `Proof point: Sandblast builds around retro, nostalgia-driven programming with clear blocks and grids.\n` +
        `Next action: Tell me if you’re trying to *watch* a show, *schedule* a show, or *promote/upload* one, and I’ll guide you.`
      );
    }

    // ---------------- RADIO ----------------
    case 'radio': {
      const deepenKeywords = [
        'tell me more',
        'explain more',
        'go deeper',
        'more detail',
        'more details',
        'go into detail',
        'go into more detail'
      ];
      const wantsMoreDetail =
        deepenKeywords.some(k => lower.includes(k));

      if (wantsMoreDetail && wordCount <= 8) {
        return (
          `Let’s go a bit deeper on radio.\n\n` +
          `Think of each show as a mix of:\n` +
          `- Spine: the consistent elements every episode (opening, closing, key segments)\n` +
          `- Flavor: music choices or topics that shift with the day\n` +
          `- Signals: audio cues and tags that tell listeners “you’re in the right place”\n\n` +
          `Tell me which you want to tune — the spine, the flavor, or the signals — and I’ll help you shape it.`
        );
      }

      const wantsAudienceGrowth =
        (lower.includes('grow') || lower.includes('increase') || lower.includes('more listeners') || lower.includes('bigger audience')) &&
        (lower.includes('radio') || lower.includes('show') || lower.includes('program'));

      if (wantsAudienceGrowth) {
        return (
          `You want to grow your radio audience — solid goal.\n\n` +
          `You can pull three main levers:\n` +
          `1) Consistent time slots so people know when to find you.\n` +
          `2) A recognizable sound or theme for the show.\n` +
          `3) Simple, repeated mentions on-air and on social about when/where to listen.\n\n` +
          `Tell me the show name, how often it airs, and who it’s for, and I’ll suggest a simple growth plan you can actually use.`
        );
      }

      const wantsRadioPromo =
        lower.includes('promote') &&
        (lower.includes('radio') || lower.includes('show') || lower.includes('program'));

      if (wantsRadioPromo) {
        return (
          `Let’s promote your radio show properly.\n\n` +
          `A clean promo flow looks like:\n` +
          `- Short on-air promos teasing what’s coming up.\n` +
          `- A consistent tag line for the show.\n` +
          `- A few simple visual posts (if possible) that repeat the same tag.\n\n` +
          `Tell me your show’s name, format (talk, music, mix), and air time, and I’ll outline a basic promo script and structure.`
        );
      }

      const playlistOrMix =
        lower.includes('playlist') ||
        lower.includes('mix') ||
        lower.includes('set list') ||
        lower.includes('setlist');

      if (playlistOrMix) {
        return (
          `You’re thinking about your playlist/mix — good.\n\n` +
          `Treat each block like a story: open strong, hold a groove, land on something memorable.\n\n` +
          `Tell me the mood you want (for example: “Sunday morning calm” or “Friday night energy”) and the length of the block, and I’ll help you shape the arc.`
        );
      }

      return (
        `You’re in the Sandblast Radio lane.\n\n` +
        `Proof point: The channel uses themed blocks (like Gospel Sunday) and curated mixes to keep listeners engaged.\n` +
        `Next action: Tell me if you want to *promote a show*, *shape a playlist*, or *understand the radio schedule*.`
      );
    }

    // ---------------- SPONSORS ----------------
    case 'sponsors': {
      const deepenKeywords = [
        'tell me more',
        'explain more',
        'go deeper',
        'more detail',
        'more details',
        'go into detail',
        'go into more detail'
      ];
      const wantsMoreDetail =
        deepenKeywords.some(k => lower.includes(k));

      if (wantsMoreDetail && wordCount <= 8) {
        return (
          `Let’s go deeper on sponsor packages.\n\n` +
          `Think of each package as:\n` +
          `- Placement: where they appear (TV, radio, streaming, specific blocks)\n` +
          `- Frequency: how often they show up\n` +
          `- Framing: how clearly you explain what they’re supporting\n\n` +
          `Tell me which you want to tune first — placement, frequency, or framing — and I’ll help you shape it.`
        );
      }

      const lowBudget =
        lower.includes('small budget') ||
        lower.includes('low budget') ||
        lower.includes('not much money') ||
        lower.includes('limited budget');

      if (lowBudget) {
        return (
          `You’re working with a smaller budget — that’s fine.\n\n` +
          `For a growing channel, we keep it lean:\n` +
          `- One or two key placements instead of a big, scattered campaign.\n` +
          `- Very clear expectations (what they get, for how long).\n` +
          `- A short test window (4–6 weeks) to measure impact.\n\n` +
          `Tell me the sponsor type (local shop, nonprofit, service business, etc.) and your rough monthly range, and I’ll suggest a starter package layout.`
        );
      }

      const wantsMediaKit =
        lower.includes('media kit') ||
        lower.includes('rate card') ||
        lower.includes('ad rates') ||
        lower.includes('pricing');

      if (wantsMediaKit) {
        return (
          `You’re thinking about your media kit / rate card.\n\n` +
          `A simple structure that fits a growing channel is:\n` +
          `- Starter: basic on-air mentions or lower-thirds.\n` +
          `- Growth: more frequent placements + one feature spot.\n` +
          `- Flagship: prime-time or premium block association.\n\n` +
          `Tell me your typical show lengths (30 or 60 minutes) and how often you want sponsors mentioned, and I’ll help you rough out the three tiers.`
        );
      }

      const wantsHowToAdvertise =
        lower.includes('how do i advertise') ||
        lower.includes('how to advertise') ||
        lower.includes('place an ad') ||
        lower.includes('run my ad') ||
        lower.includes('book ad space') ||
        lower.includes('book a spot');

      if (wantsHowToAdvertise) {
        return (
          `To advertise on Sandblast, the flow stays straightforward:\n\n` +
          `1) Clarify the goal: awareness, traffic, or direct response.\n` +
          `2) Match that to TV, radio, streaming, or a mix.\n` +
          `3) Pick one test package and a short time window (4–6 weeks) to measure.\n\n` +
          `Tell me your business type and your primary goal, and I’ll sketch a simple test campaign format.`
        );
      }

      return (
        `You’re asking about sponsors and advertising.\n\n` +
        `Proof point: Sandblast focuses on realistic sponsor packages sized for a growing channel, not a giant network.\n` +
        `Next action: Tell me your business type and your rough budget, and I’ll outline a starter package idea.`
      );
    }

    // ---------------- STREAMING ----------------
    case 'streaming': {
      const deepenKeywords = [
        'tell me more',
        'explain more',
        'go deeper',
        'more detail',
        'more details',
        'go into detail',
        'go into more detail'
      ];
      const wantsMoreDetail =
        deepenKeywords.some(k => lower.includes(k));

      if (wantsMoreDetail && wordCount <= 8) {
        return (
          `Let’s go deeper on streaming.\n\n` +
          `You can think in three layers:\n` +
          `- Files: formats, bitrates, and how clean your source is.\n` +
          `- Delivery: the player or platform that actually serves the video/audio.\n` +
          `- Experience: how easy it is for viewers to find, play, and keep watching.\n\n` +
          `Tell me which layer you want to focus on — files, delivery, or experience — and I’ll walk through it with you.`
        );
      }

      const technicalIssues =
        lower.includes('buffering') ||
        lower.includes('lags') ||
        lower.includes('lagging') ||
        lower.includes('freezing') ||
        lower.includes('not playing') ||
        lower.includes('doesn t play') ||
        lower.includes('doesnt play') ||
        lower.includes('won t play') ||
        lower.includes('wont play');

      if (technicalIssues) {
        return (
          `You’re dealing with streaming issues — let’s keep the triage simple.\n\n` +
          `Start by checking three things:\n` +
          `1) Source file: is it encoded in a web-friendly format (like H.264 MP4)?\n` +
          `2) Hosting / player: is the platform known to handle your file size and bitrate?\n` +
          `3) Network: is this happening on all connections or just one?\n\n` +
          `Tell me where the file lives now (local, cloud, a specific platform) and what the exact symptom is, and I’ll suggest the next move.`
        );
      }

      const wantsStreamingStart =
        (lower.includes('start') || lower.includes('first step') || lower.includes('where do i begin')) &&
        (lower.includes('streaming') || lower.includes('online channel') || lower.includes('ott') || lower.includes('roku'));

      if (wantsStreamingStart) {
        return (
          `You want to start streaming without overcomplicating the stack.\n\n` +
          `The first practical step is to choose *one* reliable path from your content folder to a player your audience can actually reach.\n\n` +
          `Tell me what you have now — just files, an existing site, or a specific platform in mind — and I’ll help you decide the next concrete move.`
        );
      }

      const uploadOrOnDemand =
        lower.includes('upload') ||
        lower.includes('on demand') ||
        lower.includes('on-demand') ||
        lower.includes('watch online') ||
        lower.includes('watch on line');

      if (uploadOrOnDemand) {
        return (
          `You’re thinking about on-demand viewing.\n\n` +
          `Grouping content into collections works well: westerns, detective shows, gospel music, kids’ content, etc.\n\n` +
          `Tell me which category you want to prioritize first, and I’ll help you think through how to present it so people actually click and watch.`
        );
      }

      return (
        `You’re talking streaming / online channel logistics.\n\n` +
        `Proof point: Sandblast is built to move content from “old TV feel” into modern OTT/online viewing without overcomplicating the stack.\n` +
        `Next action: Tell me if your priority is *uploading content*, *viewing on different devices*, or *planning an OTT channel*.`
      );
    }

    // ---------------- NEWS CANADA ----------------
    case 'news_canada': {
      const deepenKeywords = [
        'tell me more',
        'explain more',
        'go deeper',
        'more detail',
        'more details',
        'go into detail',
        'go into more detail'
      ];
      const wantsMoreDetail =
        deepenKeywords.some(k => lower.includes(k));

      if (wantsMoreDetail && wordCount <= 8) {
        return (
          `Let’s go deeper on News Canada integration.\n\n` +
          `Think of each piece as:\n` +
          `- Topic: what it’s about (health, finance, lifestyle, etc.)\n` +
          `- Tone: serious, neutral, or light\n` +
          `- Placement: where it supports your existing blocks instead of feeling random\n\n` +
          `Tell me the topic and whether you see it on TV, radio, or streaming, and I’ll help you place it cleanly.`
        );
      }

      const whereToRun =
        (lower.includes('where') && lower.includes('run')) ||
        lower.includes('where should this go') ||
        lower.includes('where do i place this') ||
        lower.includes('best slot');

      if (whereToRun) {
        return (
          `You’re figuring out where to run a News Canada piece.\n\n` +
          `Think about:\n` +
          `- Topic (health, finance, lifestyle, etc.)\n` +
          `- Tone (serious, light, family)\n` +
          `- Existing blocks it can support\n\n` +
          `Tell me the topic and whether you want it on TV, radio, or streaming, and I’ll suggest how to slot it in without breaking your flow.`
        );
      }

      const sponsorTieIn =
        lower.includes('sponsor') ||
        lower.includes('tie in') ||
        lower.includes('tie-in') ||
        lower.includes('align with') ||
        lower.includes('brand fit');

      if (sponsorTieIn) {
        return (
          `You want to align a sponsor with a News Canada piece.\n\n` +
          `Match them on theme: money brands with financial content, health brands with wellness features, etc.\n\n` +
          `Tell me the sponsor type and the News Canada topic, and I’ll outline one or two clean ways to bring them together.`
        );
      }

      return (
        `You’re asking about News Canada content.\n\n` +
        `Proof point: News Canada pieces can slot into Sandblast as value-add editorial segments for viewers.\n` +
        `Next action: Tell me if you want to *run a specific piece*, *understand placement options*, or *align it with a sponsor*.`
      );
    }

    // ---------------- AI CONSULTING ----------------
    case 'ai_consulting': {
      const deepenKeywords = [
        'tell me more',
        'explain more',
        'go deeper',
        'more detail',
        'more details',
        'go into detail',
        'go into more detail'
      ];
      const wantsMoreDetail =
        deepenKeywords.some(k => lower.includes(k));

      if (wantsMoreDetail && wordCount <= 8) {
        return (
          `Let’s go deeper on the AI side.\n\n` +
          `I usually break it into:\n` +
          `- People: who needs to understand and use AI safely.\n` +
          `- Processes: where AI can reduce friction or save time.\n` +
          `- Guardrails: what should *never* go into the system.\n\n` +
          `Tell me whether you’re more worried about people, processes, or guardrails, and I’ll walk through that layer with you.`
        );
      }

      const trainingWorkshop =
        lower.includes('training') ||
        lower.includes('workshop') ||
        lower.includes('session') ||
        lower.includes('course') ||
        lower.includes('bootcamp');

      if (trainingWorkshop) {
        return (
          `You’re in AI training / workshop territory.\n\n` +
          `A strong session usually has three parts:\n` +
          `1) Clarity — what AI is and isn’t, in plain language.\n` +
          `2) Safety — what to avoid (confidential data, overtrusting outputs).\n` +
          `3) Hands-on — people actually using AI on their own tasks.\n\n` +
          `Tell me your audience (staff, leaders, job seekers, small businesses) and the session length, and I’ll sketch a simple structure with 3–4 clear outcomes.`
        );
      }

      const strategyRoadmap =
        lower.includes('strategy') ||
        lower.includes('roadmap') ||
        lower.includes('road map') ||
        lower.includes('plan for ai');

      if (strategyRoadmap) {
        return (
          `You’re thinking about AI strategy.\n\n` +
          `We don’t need a huge document — we need a short, usable roadmap that answers:\n` +
          `1) What problems are we trying to solve?\n` +
          `2) What tools are realistic at our size and budget?\n` +
          `3) How do we train people and keep it safe?\n\n` +
          `Tell me the type of organization (public, nonprofit, small business, etc.) and one problem you want AI to help with, and I’ll outline a simple path.`
        );
      }

      const jobSearchUse =
        lower.includes('resume') ||
        lower.includes('cover letter') ||
        lower.includes('job search') ||
        lower.includes('job applications') ||
        lower.includes('interview prep') ||
        lower.includes('interview preparation');

      if (jobSearchUse) {
        return (
          `You’re looking at AI to support job search tasks.\n\n` +
          `AI can help draft resumes and cover letters, prepare interview answers, and organize job applications — as long as people stay honest and double-check the outputs.\n\n` +
          `Tell me whether you’re helping *yourself* or *other people* (like clients or students), and I’ll suggest a simple, safe workflow for using AI in that context.`
        );
      }

      return (
        `You’re in the AI consulting lane.\n\n` +
        `Proof point: Sandblast’s AI brain is built around practical use cases: routing, media workflows, training, and realistic outcomes.\n` +
        `Next action: Tell me if you’re looking for *training*, *strategy for your organization*, or *help building an AI-powered workflow*.`
      );
    }

    // ---------------- DEFAULT ----------------
    default:
      return (
        `Got you. I’m treating this as a general question for now.\n\n` +
        `Proof point: The Sandblast AI brain is designed to route people between TV, radio, sponsors, streaming, News Canada, and AI consulting.\n` +
        `Next action: Give me one clear goal in a sentence (for example: “I want to promote my show” or “I want to learn AI for my team”).`
      );
  }
}

// -------------------------------------------
// Nyx brain: build reply with personality
// -------------------------------------------
function buildNyxReply(intent, message, meta) {
  const domain = mapIntentToDomain(intent);
  meta.domain = domain;

  let baseReply = buildBaseReply(intent, message, meta);

  // For GREETING we keep it simple: no heavy personality/domain overrides
  if (intent !== INTENTS.GREETING && nyxPersonality) {
    try {
      if (intent === INTENTS.GENERIC && typeof nyxPersonality.getFrontDoorResponse === 'function') {
        const raw = nyxPersonality.getFrontDoorResponse(message, meta);
        const asString = ensureStringFromAnyReply(raw);
        if (isNonEmptyString(asString)) baseReply = asString;
      } else if (intent !== INTENTS.GENERIC && typeof nyxPersonality.getDomainResponse === 'function') {
        const raw = nyxPersonality.getDomainResponse(domain, message, meta);
        const asString = ensureStringFromAnyReply(raw);
        if (isNonEmptyString(asString)) baseReply = asString;
      } else if (intent !== INTENTS.GENERIC && typeof nyxPersonality.enrichDomainResponse === 'function') {
        let payload = { reply: baseReply, meta: { ...meta } };
        const rawPayload = nyxPersonality.enrichDomainResponse(message, payload) || payload;
        const replyCandidate = ensureStringFromAnyReply(rawPayload.reply ?? rawPayload);
        if (isNonEmptyString(replyCandidate)) baseReply = replyCandidate;
      }
    } catch (e) {
      console.warn('[Nyx] Personality helper threw an error, using base reply:', e.message);
    }
  }

  let finalReply = baseReply;
  if (nyxPersonality && typeof nyxPersonality.wrapWithNyxTone === 'function') {
    try {
      const wrapped = nyxPersonality.wrapWithNyxTone(baseReply, meta);
      const wrappedString = ensureStringFromAnyReply(wrapped);
      if (isNonEmptyString(wrappedString)) {
        finalReply = wrappedString;
      }
    } catch (e) {
      console.warn('[Nyx] wrapWithNyxTone failed, falling back to base reply:', e.message);
    }
  }

  return finalReply;
}

// -----------------------------
// Health check
// -----------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Sandblast Nyx brain is running.' });
});

// -----------------------------
// Main brain endpoint
// -----------------------------
app.post('/api/sandblast-gpt', async (req, res) => {
  try {
    const userMessage = (req.body && req.body.message) || '';
    const contextLabel = (req.body && req.body.contextLabel) || 'web_widget';
    const sessionId = (req.body && req.body.sessionId) || null;

    const conversationKey = sessionId || contextLabel || 'default';

    const previousState =
      conversationState[conversationKey] || {
        lastDomain: 'general',
        lastIntent: null,
        lastGoal: null,
        lastMessage: null,
        turnCount: 0,
        lastUpdated: null
      };

    const { intent, confidence, toneHint } = classifyIntent(userMessage);

    console.log('[Nyx] Message + intent', {
      message: userMessage,
      intent,
      confidence,
      toneHint,
      conversationKey
    });

    const meta = {
      intent,
      confidence,
      toneHint,
      contextLabel,
      sessionId,
      conversationKey,
      previousState,
      source: 'sandblast_web_widget',
      timestamp: new Date().toISOString()
    };

    const rawReply = buildNyxReply(intent, userMessage, meta);
    const reply = ensureStringFromAnyReply(rawReply) ||
      'Nyx is online, but that last reply came back empty. Try asking again in a slightly different way.';

    const nextState = {
      lastDomain: meta.domain || previousState.lastDomain || 'general',
      lastIntent: intent,
      lastGoal: looksLikeGoalMessage(userMessage) ? userMessage : previousState.lastGoal,
      lastMessage: userMessage,
      turnCount: (previousState.turnCount || 0) + 1,
      lastUpdated: new Date().toISOString()
    };

    conversationState[conversationKey] = nextState;
    meta.currentState = nextState;

    res.json({ reply, meta });
  } catch (err) {
    console.error('[Nyx] /api/sandblast-gpt error:', err);
    res.status(500).json({
      error: 'NYX_BRAIN_ERROR',
      message: 'Something glitched while Nyx was thinking. Try again in a moment.',
    });
  }
});

// -----------------------------
// (Optional) TTS endpoint stub
// -----------------------------
app.post('/api/tts', async (req, res) => {
  try {
    res.status(501).json({
      error: 'TTS_NOT_IMPLEMENTED',
      message: 'TTS is not fully wired on this backend version.'
    });
  } catch (err) {
    console.error('[Nyx] /api/tts error:', err);
    res.status(500).json({
      error: 'TTS_ERROR',
      message: 'Nyx had trouble speaking that out loud.'
    });
  }
});

// -----------------------------
// Start server
// -----------------------------
app.listen(PORT, () => {
  console.log(`[Nyx] Sandblast backend listening on port ${PORT}`);
});

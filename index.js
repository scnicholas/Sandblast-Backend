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

  // 1) Pure greeting – Nyx greets first, then asks about you.
  if (intent === INTENTS.GREETING) {
    return (
      `Hi, I’m Nyx. It’s good to see you.\n\n` +
      `How are you today?`
    );
  }

  // 2) GENERIC lane – conversational logic, closer to “Vera style”
  if (intent === INTENTS.GENERIC) {
    const tone = meta.toneHint || 'neutral';

    // 2a) Positive / neutral status replies
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

    // 2b) Low / negative status replies (or low tone)
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

    // 2c) Thanks / appreciation
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

    // 2d) Confused / stuck – tone or wording
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

    // 2e) Excited / pumped
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
        `What’s the main thing you want to push right now — your show, a sponsor idea, your streaming setup, or an AI goal (like Employment Ontario prep)?`
      );
    }

    // 2f) Generic “what can you do / show me around” front door
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

  // 3) Domain-specific lanes
  switch (domain) {
    case 'tv':
      return (
        `You’re asking about TV/programming.\n\n` +
        `Proof point: Sandblast builds around retro, nostalgia-driven programming with clear blocks and grids.\n` +
        `Next action: Tell me if you’re trying to *watch* a show, *schedule* a show, or *upload* one, and I’ll guide you.`
      );

    case 'radio':
      return (
        `You’re in the Sandblast Radio lane.\n\n` +
        `Proof point: The channel uses themed blocks (like Gospel Sunday) and curated mixes to keep listeners engaged.\n` +
        `Next action: Tell me if you want to *promote a show*, *shape a playlist*, or *understand the radio schedule*.`
      );

    case 'sponsors':
      return (
        `You’re asking about sponsors and advertising.\n\n` +
        `Proof point: Sandblast focuses on realistic sponsor packages sized for a growing channel, not a giant network.\n` +
        `Next action: Tell me your business type and your rough budget, and I’ll outline a starter package idea.`
      );

    case 'streaming':
      return (
        `You’re talking streaming / online channel logistics.\n\n` +
        `Proof point: Sandblast is built to move content from “old TV feel” into modern OTT/online viewing without overcomplicating the stack.\n` +
        `Next action: Tell me if your priority is *uploading content*, *viewing on different devices*, or *planning an OTT channel*.`
      );

    case 'news_canada':
      return (
        `You’re asking about News Canada content.\n\n` +
        `Proof point: News Canada pieces can slot into Sandblast as value-add editorial segments for viewers.\n` +
        `Next action: Tell me if you want to *run a specific piece*, *understand placement options*, or *align it with a sponsor*.`
      );

    case 'ai_consulting':
      return (
        `You’re in the AI consulting lane.\n\n` +
        `Proof point: Sandblast’s AI brain is built around practical use cases: routing, media workflows, training, and realistic outcomes.\n` +
        `Next action: Tell me if you’re looking for *training*, *strategy for your organization*, or *help building an AI-powered workflow*.`
      );

    default:
      return (
        `Got you. I’m treating this as a general question for now.\n\n` +
        `Proof point: The Sandblast AI brain is designed to route people between TV, radio, sponsors, streaming, news, and AI consulting.\n` +
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

    const { intent, confidence, toneHint } = classifyIntent(userMessage);

    const meta = {
      intent,
      confidence,
      toneHint,
      contextLabel,
      source: 'sandblast_web_widget',
      timestamp: new Date().toISOString()
    };

    const rawReply = buildNyxReply(intent, userMessage, meta);
    const reply = ensureStringFromAnyReply(rawReply) ||
      'Nyx is online, but that last reply came back empty. Try asking again in a slightly different way.';

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

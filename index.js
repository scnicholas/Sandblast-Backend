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

// Use Render's port or default to 3000 locally
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
    case INTENTS.GENERIC:
    default:
      return 'general';
  }
}

// -------------------------------------------
// Fallback base replies (if personality file
// doesn’t provide a custom generator)
// -------------------------------------------
function buildBaseReply(intent, message, meta) {
  const domain = meta.domain || 'general';

  if (intent === INTENTS.GENERIC) {
    // Front-door / small talk / “what can you do?”
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

  // If nyxPersonality provides its own domain/front-door logic, use that first
  let baseReply;

  if (nyxPersonality && typeof nyxPersonality.getFrontDoorResponse === 'function' && intent === INTENTS.GENERIC) {
    baseReply = nyxPersonality.getFrontDoorResponse(message, meta);
  } else if (nyxPersonality && typeof nyxPersonality.getDomainResponse === 'function' && intent !== INTENTS.GENERIC) {
    baseReply = nyxPersonality.getDomainResponse(domain, message, meta);
  } else if (nyxPersonality && typeof nyxPersonality.enrichDomainResponse === 'function' && intent !== INTENTS.GENERIC) {
    // For older versions where enrichDomainResponse expects a payload
    let payload = { reply: buildBaseReply(intent, message, meta), meta: { ...meta } };
    payload = nyxPersonality.enrichDomainResponse(message, payload);
    baseReply = payload.reply || buildBaseReply(intent, message, meta);
  } else {
    // Fallback text if no personality helpers exist
    baseReply = buildBaseReply(intent, message, meta);
  }

  // Always wrap with tone if available
  if (nyxPersonality && typeof nyxPersonality.wrapWithNyxTone === 'function') {
    return nyxPersonality.wrapWithNyxTone(baseReply, meta);
  }

  return baseReply;
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

    const reply = buildNyxReply(intent, userMessage, meta);

    res.json({
      reply,
      meta
    });
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
// Keep this if your widget calls /api/tts
// -----------------------------
app.post('/api/tts', async (req, res) => {
  try {
    // This is just a placeholder. Your existing ElevenLabs logic can live here.
    // Keep the route so the widget doesn’t break while you refine TTS.
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

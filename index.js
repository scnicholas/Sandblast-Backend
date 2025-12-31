'use strict';

/* ======================================================
   Sandblast Backend — Nyx
   index.js (Layer 1 + Layer 2 locked)
====================================================== */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

/* =========================
   ENV / CONSTANTS
========================= */

const PORT = process.env.PORT || 3000;
const NYX_INTELLIGENCE_LEVEL = Number(process.env.NYX_INTELLIGENCE_LEVEL || 2);

const ANTI_LOOP_WINDOW_MS = Number(process.env.NYX_ANTI_LOOP_WINDOW_MS || 1600);
const REPEAT_REPLY_WINDOW_MS = Number(process.env.NYX_REPEAT_REPLY_WINDOW_MS || 120000);
const MAX_REPEAT_REPLY = Number(process.env.NYX_MAX_REPEAT_REPLY || 2);
const DUP_REQ_WINDOW_MS = Number(process.env.NYX_DUP_REQ_WINDOW_MS || 20000);

const NYX_HELLO_TOKEN = '__nyx_hello__';

/* =========================
   HELPERS
========================= */

function clean(x) {
  return typeof x === 'string' ? x.trim() : '';
}

function normText(x) {
  return clean(x).toLowerCase().replace(/\s+/g, ' ');
}

function isGreeting(msg) {
  const m = normText(msg);
  return ['hi', 'hello', 'hey', 'hi nyx', 'hello nyx', 'hey nyx'].includes(m);
}

function extractName(msg) {
  const m = msg.match(/\bmy name is\s+([A-Za-z'\- ]{2,40})/i);
  return m ? m[1].trim() : null;
}

/* =========================
   LANE LOGIC
========================= */

function laneFromMessage(m) {
  if (m === 'music') return 'music';
  if (m === 'tv') return 'tv';
  if (m === 'sponsors') return 'sponsors';
  if (m === 'ai') return 'ai';
  return null;
}

function inferLaneFromFreeText(msg) {
  const m = normText(msg);
  if (/widget|backend|api|index\.js|render|loop|bug|error|voice|tts|stt/i.test(m)) return 'ai';
  if (/music|chart|song|billboard/i.test(m)) return 'music';
  if (/tv|show|series/i.test(m)) return 'tv';
  if (/sponsor|advert/i.test(m)) return 'sponsors';
  return null;
}

function inferAiSubtopic(msg) {
  const m = normText(msg);
  if (/widget|frontend|webflow|mobile|panel/i.test(m)) return 'widget';
  if (/backend|api|render|server|index\.js/i.test(m)) return 'backend';
  if (/voice|tts|stt|mic|audio/i.test(m)) return 'voice';
  return null;
}

/* =========================
   GUIDED QUESTIONS
========================= */

function nyxGuidedQuestionForLane(lane, session) {
  const name = session.displayName ? `${session.displayName}, ` : '';
  if (lane === 'ai') return `${name}are we working on the backend, the widget, or content intelligence?`;
  if (lane === 'music') return `${name}what year should we start with?`;
  if (lane === 'tv') return `${name}what are you looking to watch?`;
  if (lane === 'sponsors') return `${name}are you advertising or exploring options?`;
  return `${name}what are we doing today?`;
}

/* =========================
   🔥 LAYER 2 — MESSAGE-AWARE TIGHTENING
========================= */

function tightenAiGuidanceIfPossible(session, message, fallbackPrompt) {
  if (NYX_INTELLIGENCE_LEVEL < 2) return fallbackPrompt;

  const sub = session.aiSubtopic;
  const m = normText(message || '');

  if (sub === 'widget') {
    if (/\b(loop|looping|repeat)\b/i.test(m)) {
      return 'When it loops, is the widget re-sending the same request, or is Nyx repeating the same reply?';
    }
    if (/\b(mobile|iphone|android|ios)\b/i.test(m)) {
      return 'On mobile, what fails first — positioning, looping, mic, or rendering?';
    }
    return 'What part is failing — positioning, looping, mic, or rendering?';
  }

  if (sub === 'backend') {
    return 'What’s the symptom — looping, slow response, 500s, or bad routing?';
  }

  if (sub === 'voice') {
    return 'Is the issue TTS, STT transcript, or S2S playback?';
  }

  return fallbackPrompt;
}

/* =========================
   SESSION STORE
========================= */

const SESSIONS = new Map();

function getSession(id) {
  if (!SESSIONS.has(id)) {
    SESSIONS.set(id, {
      id,
      lane: 'general',
      displayName: null,
      aiSubtopic: null,
      lastSig: null,
      lastSigAt: 0,
      lastReply: null,
      lastReplyAt: 0,
      repeatCount: 0,
      serverMsgId: 0,
    });
  }
  return SESSIONS.get(id);
}

/* =========================
   RESPONSE HELPERS
========================= */

function replyNoChips(text) {
  return { reply: text, followUp: null };
}

/* =========================
   CHAT CORE
========================= */

function runNyxChat(body) {
  const message = clean(body.message || '');
  const sessionId = body.sessionId || crypto.randomUUID();
  const session = getSession(sessionId);
  session.serverMsgId++;

  if (message === NYX_HELLO_TOKEN) {
    return {
      ok: true,
      reply: "You’re on Sandblast Channel — classic TV, timeless music, and modern insight. I’m Nyx. How can I help you?",
      followUp: null,
      sessionId,
      serverMsgId: session.serverMsgId,
    };
  }

  const name = extractName(message);
  if (name) {
    session.displayName = name;
    return {
      ok: true,
      reply: `Nice to meet you, ${name}.\nWhat should we do first?`,
      followUp: null,
      sessionId,
      serverMsgId: session.serverMsgId,
    };
  }

  if (isGreeting(message)) {
    return {
      ok: true,
      reply: session.displayName ? `Hey, ${session.displayName}.\nWhat are we doing today?` : 'Hey.\nWhat are we doing today?',
      followUp: null,
      sessionId,
      serverMsgId: session.serverMsgId,
    };
  }

  const mLower = normText(message);
  let lanePick = laneFromMessage(mLower);

  if (!lanePick) {
    lanePick = inferLaneFromFreeText(message);
  }

  if (lanePick) {
    session.lane = lanePick;

    if (lanePick === 'ai') {
      session.aiSubtopic = inferAiSubtopic(message);
      let guided = nyxGuidedQuestionForLane('ai', session);
      guided = tightenAiGuidanceIfPossible(session, message, guided);

      return {
        ok: true,
        reply: `Got it.\n${guided}`,
        followUp: null,
        sessionId,
        serverMsgId: session.serverMsgId,
      };
    }

    return {
      ok: true,
      reply: `Got it.\n${nyxGuidedQuestionForLane(lanePick, session)}`,
      followUp: null,
      sessionId,
      serverMsgId: session.serverMsgId,
    };
  }

  return {
    ok: true,
    reply: session.displayName ? `Got it, ${session.displayName}.\nWhat are we doing today?` : 'Got it.\nWhat are we doing today?',
    followUp: null,
    sessionId,
    serverMsgId: session.serverMsgId,
  };
}

/* =========================
   EXPRESS APP
========================= */

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/api/chat', (req, res) => {
  try {
    const payload = runNyxChat(req.body || {});
    res.status(200).json(payload);
  } catch (err) {
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    nyx: { intelligenceLevel: NYX_INTELLIGENCE_LEVEL },
    sessions: SESSIONS.size,
    time: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[Nyx] listening on ${PORT}`);
});

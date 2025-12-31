'use strict';

/* ======================================================
   Sandblast Backend — Nyx
   index.js (Layer 1 + Layer 2 locked + Loop Micro-Flow)
   + HARDENING: keepalive + crash hooks + server error hooks + debug/last
====================================================== */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

/* =========================
   ENV / CONSTANTS
========================= */

const PORT = Number(process.env.PORT || 3000);
const NYX_INTELLIGENCE_LEVEL = Number(process.env.NYX_INTELLIGENCE_LEVEL || 2);

const NYX_HELLO_TOKEN = '__nyx_hello__';

// Keepalive: prevents “prints listening then dies” issues in some Windows/pipeline scenarios.
// Set NYX_KEEPALIVE=0 to disable (not recommended during debugging).
const NYX_KEEPALIVE = String(process.env.NYX_KEEPALIVE ?? '1') !== '0';

/* =========================
   PROCESS HARDENING
========================= */

process.on('uncaughtException', (err) => {
  console.error('[Nyx] uncaughtException:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Nyx] unhandledRejection:', reason && reason.stack ? reason.stack : reason);
});

// Useful for sanity: confirm PID + cwd at boot
console.log(`[Nyx] boot pid=${process.pid} cwd=${process.cwd()} node=${process.version}`);

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
  if (/widget|backend|api|index\.js|render|loop|looping|bug|error|voice|tts|stt|mic|audio/i.test(m)) return 'ai';
  if (/music|chart|song|billboard/i.test(m)) return 'music';
  if (/tv|show|series/i.test(m)) return 'tv';
  if (/sponsor|advert/i.test(m)) return 'sponsors';
  return null;
}

function inferAiSubtopic(msg) {
  const m = normText(msg);
  if (/widget|frontend|webflow|mobile|panel|ios|android|safari|chrome/i.test(m)) return 'widget';
  if (/backend|api|render|server|index\.js/i.test(m)) return 'backend';
  if (/voice|tts|stt|scribe|mic|audio/i.test(m)) return 'voice';
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
   LAYER 2 — MESSAGE-AWARE TIGHTENING
========================= */

function tightenAiGuidanceIfPossible(session, message, fallbackPrompt) {
  if (NYX_INTELLIGENCE_LEVEL < 2) return fallbackPrompt;

  const sub = clean(session?.aiSubtopic);
  const m = normText(message || '');

  if (sub === 'widget') {
    if (/\b(loop|looping|repeat|repeating|keeps repeating)\b/i.test(m)) {
      return 'When it loops, is the widget re-sending the same request, or is Nyx repeating the same reply?';
    }
    if (/\b(mobile|iphone|android|ios|safari|chrome)\b/i.test(m)) {
      return 'On mobile, what fails first — positioning, looping, mic, or rendering?';
    }
    return 'What part is failing — positioning, looping, mic, or rendering?';
  }

  if (sub === 'backend') {
    if (/\b(500|502|503|timeout|slow|latency)\b/i.test(m)) {
      return 'Are you seeing 500s, timeouts, or slow responses?';
    }
    return 'What’s the symptom — looping, slow response, 500s, or bad routing?';
  }

  if (sub === 'voice') {
    if (/\b(transcript|stt|scribe)\b/i.test(m)) return 'Is STT failing to return a transcript, or returning the wrong words?';
    if (/\b(tts|voice|audio)\b/i.test(m)) return 'Is TTS failing to generate audio, or is playback failing in the widget?';
    return 'Is the issue TTS, STT transcript, or S2S playback?';
  }

  return fallbackPrompt;
}

/* =========================
   LOOP DIAGNOSTIC MICRO-FLOW (Layer 2 continuation)
========================= */

function inferLoopKindAnswer(msg) {
  const m = normText(msg);

  // Widget re-sending requests
  if (/\b(resend|re-send|re sending|re-sending|double send|sending twice|multiple requests|requests|network|fetch|post|api call|calls)\b/i.test(m)) {
    return 'resending_request';
  }

  // Nyx repeating reply
  if (/\b(same reply|repeating reply|repeats the reply|same response|repeating response|nyx repeats|keeps saying)\b/i.test(m)) {
    return 'repeating_reply';
  }

  return null;
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

      // micro-flow state
      aiDiag: null,         // e.g. 'loop_kind'
      aiDiagAskedAt: 0,

      serverMsgId: 0,
    });
  }
  return SESSIONS.get(id);
}

/* =========================
   DEBUG LAST (optional but extremely useful)
========================= */

let LAST_DEBUG = { ok: true, route: null, request: null, response: null, error: null };

function setDebug(route, request, response, error = null) {
  LAST_DEBUG = {
    ok: true,
    route,
    request,
    response,
    error: error ? String(error?.stack || error) : null,
  };
}

/* =========================
   CHAT CORE
========================= */

function runNyxChat(body) {
  const message = clean(body.message || '');
  const sessionId = body.sessionId || crypto.randomUUID();
  const session = getSession(sessionId);
  session.serverMsgId++;

  // A) Widget open intro
  if (message === NYX_HELLO_TOKEN) {
    return {
      ok: true,
      reply: "You’re on Sandblast Channel — classic TV, timeless music, and modern insight. I’m Nyx. How can I help you?",
      followUp: null,
      sessionId,
      serverMsgId: session.serverMsgId,
    };
  }

  // B) Name capture
  const name = extractName(message);
  if (name) {
    session.displayName = name;
    session.aiDiag = null;
    return {
      ok: true,
      reply: `Nice to meet you, ${name}.\nWhat should we do first?`,
      followUp: null,
      sessionId,
      serverMsgId: session.serverMsgId,
    };
  }

  // C) Greeting acknowledgement
  if (isGreeting(message)) {
    session.aiDiag = null;
    return {
      ok: true,
      reply: session.displayName ? `Hey, ${session.displayName}.\nWhat are we doing today?` : 'Hey.\nWhat are we doing today?',
      followUp: null,
      sessionId,
      serverMsgId: session.serverMsgId,
    };
  }

  // D) Continue micro-flow
  if (NYX_INTELLIGENCE_LEVEL >= 2 && session.aiDiag === 'loop_kind') {
    const kind = inferLoopKindAnswer(message);

    if (kind === 'resending_request') {
      session.aiDiag = 'loop_widget_evidence';
      return {
        ok: true,
        reply:
          "Good — that narrows it.\n" +
          "Next: can you confirm whether the widget sends two /api/chat POSTs per one user action?\n" +
          "If yes: is it on send-click, enter-key, or triggered by both?",
        followUp: null,
        sessionId,
        serverMsgId: session.serverMsgId,
      };
    }

    if (kind === 'repeating_reply') {
      session.aiDiag = 'loop_server_evidence';
      return {
        ok: true,
        reply:
          "Got it — that’s a server-side repeat.\n" +
          "Next: does it repeat even when the user message changes, or only when the message is identical?\n" +
          "And does serverMsgId keep increasing each time?",
        followUp: null,
        sessionId,
        serverMsgId: session.serverMsgId,
      };
    }

    return {
      ok: true,
      reply:
        "Quick check so I don’t guess wrong:\n" +
        "Which one are you seeing — multiple requests being sent, or the same reply repeating?",
      followUp: null,
      sessionId,
      serverMsgId: session.serverMsgId,
    };
  }

  // E) Determine lane
  const mLower = normText(message);
  let lanePick = laneFromMessage(mLower);
  if (!lanePick) lanePick = inferLaneFromFreeText(message);

  // F) Apply Layer 1 + Layer 2
  if (lanePick) {
    session.lane = lanePick;

    if (lanePick !== 'ai') {
      session.aiDiag = null;
      return {
        ok: true,
        reply: `Got it.\n${nyxGuidedQuestionForLane(lanePick, session)}`,
        followUp: null,
        sessionId,
        serverMsgId: session.serverMsgId,
      };
    }

    session.aiSubtopic = inferAiSubtopic(message);

    let guided = nyxGuidedQuestionForLane('ai', session);
    guided = tightenAiGuidanceIfPossible(session, message, guided);

    if (guided.includes('When it loops, is the widget re-sending')) {
      session.aiDiag = 'loop_kind';
      session.aiDiagAskedAt = Date.now();
    } else {
      session.aiDiag = null;
    }

    return {
      ok: true,
      reply: `Got it.\n${guided}`,
      followUp: null,
      sessionId,
      serverMsgId: session.serverMsgId,
    };
  }

  // G) Default fallback
  session.aiDiag = null;
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
    setDebug('/api/chat', req.body || {}, payload, null);
    res.status(200).json(payload);
  } catch (err) {
    setDebug('/api/chat', req.body || {}, null, err);
    res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

app.get('/api/health', (_req, res) => {
  const payload = {
    ok: true,
    nyx: { intelligenceLevel: NYX_INTELLIGENCE_LEVEL },
    sessions: SESSIONS.size,
    time: new Date().toISOString(),
    pid: process.pid,
    port: PORT,
    keepalive: NYX_KEEPALIVE,
  };
  setDebug('/api/health', null, payload, null);
  res.json(payload);
});

app.get('/api/debug/last', (_req, res) => {
  res.json(LAST_DEBUG);
});

/* =========================
   START SERVER (HARDENED)
========================= */

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Nyx] listening on ${PORT}`);
});

server.on('error', (err) => {
  console.error('[Nyx] server error:', err && err.stack ? err.stack : err);
});

// Keep the process alive intentionally during local debugging / Windows pipeline weirdness.
if (NYX_KEEPALIVE) {
  setInterval(() => {
    // noop - keep event loop alive
  }, 60 * 60 * 1000);
}

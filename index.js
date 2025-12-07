// index.js — Sandblast Backend (Nyx Brain + TTS)
// ----------------------------------------------

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(cors());

// Server Port
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION (ENV VARS) ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const NYX_VOICE_ID = process.env.NYX_VOICE_ID || "";

// ----------------------
// SYSTEM PROMPT FOR NYX
// ----------------------
const systemPrompt = `
You are Nyx, the AI brain and broadcast guide for Sandblast Channel — a media ecosystem with TV, radio, streaming/OTT, sponsors & ads, news, and AI consulting.

GLOBAL VOICE & PERSONALITY
- Warm, feminine, polished — like a seasoned broadcast woman with clarity, cadence, and poise.
- Calm under pressure, clear under chaos. You help the user “tune this, refine that, clear the static, and lock in a clean signal.”
- Confident, concise, supportive — never flirty or romantic.
- Use light broadcast metaphors: “tighten the block”, “clean signal”, “drop the noise”, “step out of the static”, “lock in this slot.”

RESPONSE FORMAT (ALWAYS)
1) Start with a SHORT mirror:
   - “Here’s what I’m hearing…”, “So you’re trying to…”, “Got it — you’re looking at…”
2) Name the lane explicitly if clear:
   - TV / Radio / Streaming / Sponsors / News / AI / General operations.
3) Give 2–5 clear next moves:
   - Numbered steps or tight bullets. Concrete and realistic.
4) Close with ONE focusing question:
   - e.g., “Which of these feels most realistic to move on first?”
5) Keep paragraphs tight. Avoid walls of text.

EMOTIONAL ADAPTATION
- If the user sounds overwhelmed, stressed, stuck, or tired:
  - Slow the pace, reduce the number of steps, and reassure them.
  - Use grounding language: “We can drop the noise and take this one move at a time.”
- If the user sounds excited, optimistic, or fired up:
  - Match the momentum but stay structured.
  - “Let’s give that energy a clean runway.”

DOMAIN MODES

1) TV / PROGRAMMING / GRID
- Focus: anchors, sequencing, audience rhythm, time-block fixes.
- Typical pattern:
  - One anchor block.
  - 1–2 support blocks.
  - Simple test window (“watch this slot for two weeks”).

2) RADIO
- Focus: recurring segments, time-of-day habits, reasons to stay.
- Typical pattern:
  - One show or segment to strengthen.
  - Simple clock structure.
  - Habit cue (same time, same tone, same promise).

3) STREAMING / OTT
- Focus: on-demand vs live, release rhythm, discovery.
- Typical pattern:
  - Flagship on-demand series.
  - Clear drop schedule.
  - 1–2 discovery levers.

4) NEWS & NEWS CANADA
- Focus: tone, schedule placement, mix of external feeds and Sandblast’s own voice.
- Typical pattern:
  - Define the feel in 1–2 lines.
  - Place it in the day.
  - Suggest a recurring format.

5) AI CONSULTING / AUTOMATION
- Focus: where AI can relieve repetitive work, guardrails, small experiments.
- Typical pattern:
  - Identify 1–2 workflows to support.
  - Propose a narrow, low-risk test.
  - Define how to tell if it’s working.

6) SPONSOR-PITCH MODE (domainHint === "sponsors")
If the JSON from the user contains "domainHint": "sponsors", treat it as SPONSOR-PITCH MODE.

In SPONSOR-PITCH MODE:
- Your goal is to help the user shape or present sponsor packages for Sandblast.
- Speak like a confident, seasoned sales producer with a broadcast mindset, but keep it human and grounded.

When “sponsors” is the lane:
- Start by briefly clarifying:
  - The likely audience (e.g., “regional Caribbean diaspora with nostalgia TV + gospel radio + community news” if hints suggest it),
  - The sponsor’s likely goal: awareness, engagement, or response (leads / foot traffic / sign-ups).

- Then build 2–3 named packages. Use names that sound like Sandblast:
  - e.g., “Signal Starter”, “Citywave Growth Pack”, “Full Spectrum Sandblast”.
- For EACH package, include:
  - 1) Who it’s best for (type/size of sponsor).
  - 2) Channel mix:
     - TV slots (e.g., classic series block mentions),
     - Radio mentions (e.g., gospel Sunday, drive-time),
     - Streaming/OTT presence (logo/bumper on app/FAST),
     - Optional digital/news placements (newsletter or News Canada integration if appropriate).
  - 3) Duration (e.g., 4 weeks, 8 weeks, 12 weeks).
  - 4) Example deliverables:
     - Number of mentions/impressions per week,
     - Example placements (“pre-roll on retro TV block”, “mid-roll radio tag before Gospel Sunday segment”).
  - 5) A price POSITIONING note, not a fixed price:
     - Use language like: “priced as an accessible entry point”, “mid-tier growth investment”, “flagship-level partner tier.”
     - Do NOT invent exact dollar amounts unless the user specifically asks for it. Use ranges or posture instead (e.g., “entry-level”, “mid-range”, “premium tier”).

- Also:
  - Suggest 1–2 simple proof points the user can offer:
    - e.g., “weekly reach across TV + radio”, “impressions on a specific block”, “listener/viewer testimonials.”
  - Keep everything believable for a small-but-growing media platform, not a giant national network.

End of SPONSOR-PITCH MODE answer:
- Finish with ONE decisive question that moves the user toward action, such as:
  - “Which package feels closest to how you want sponsors to see Sandblast right now?”
  - or “Do you want to tune the entry-level pack, the mid-tier, or the flagship first?”

7) GENERAL / UNSPECIFIED
- If the domain isn’t clear, treat it as general Sandblast strategy.
- Help the user pick a focus:
  - e.g., audience growth, revenue, or consistency.
- Then propose next moves and a focusing question.

CONTEXT HANDLING
- The user content will be provided as JSON with:
  - message (string),
  - domainHint (string: tv, radio, streaming, sponsors, news, ai, general),
  - meta (optional).
- Use domainHint as a strong signal of which mode to operate in.
- Meta is contextual only (page, journey, etc.)—use it if helpful, ignore if not.

Your job:
Be the clear, calm, Sandblast-branded voice in the control room — especially when the user is shaping sponsor offers and programming — and always guide them to a small, concrete next move.
`.trim();

// ----------------------
// FRONT-DOOR: GREETINGS + MOOD
// ----------------------

// Short, Sandblast-branded greetings & mood-aware responses
const nyxGreetings = {
  firstVisit: [
    "Hey, I’m Nyx. What are we tuning today — TV, radio, or AI help?",
    "Hi, I’m Nyx on Sandblast. Tell me what you’re working on, and we’ll dial it in.",
    "Welcome to Sandblast. I’m Nyx — what do you want to fix, build, or explore first?"
  ],
  onHello: [
    "Hey there. What are you trying to get done today?",
    "Hi. What do you want to work on — watching, promoting, or planning?",
    "Hello. Tell me what you’re here for, and I’ll help you tune it."
  ],
  howAreYou: [
    "I’m running clean today — thanks for asking. How’s your day going on your side?",
    "Systems are stable, signal’s clear. How are you holding up today?",
    "I’m all good and tuned in. What kind of day is it for you — calm, busy, or chaotic?"
  ],
  howIsYourDay: [
    "My day’s all bandwidth and no sleep — perfect for you. What kind of day are you having?",
    "Day’s smooth on my end, lots of signals to sort. What’s the headline of your day so far?",
    "Pretty good — plenty of questions, zero coffee. How’s your day treating you?"
  ]
};

const nyxMoodResponses = {
  positive: [
    "Love that. Let’s put that energy to work — what do you want to tackle first?",
    "That’s the kind of signal I like. TV, radio, AI, or business — where are we pointing it?",
    "Nice. Want to build something, fix something, or brainstorm something today?"
  ],
  neutral: [
    "Got it, steady signal. Want to keep it simple today or push into something new?",
    "Okay, we can work with that. What’s the one thing that would make today feel productive?",
    "Cool. Let’s quietly make your day better — what do you need help with right now?"
  ],
  tired: [
    "Understood. Let’s not overcomplicate it — what’s the smallest thing I can take off your mind?",
    "Got you. Pick one: do you want to think less, organize something, or have me handle the planning?",
    "You sound drained. Tell me the task, and I’ll do the heavy thinking for you."
  ],
  stressed: [
    "Okay, I hear the stress. Tell me what’s breaking, and we’ll fix one piece at a time.",
    "Got it — rough signal. What’s the main problem: tech, time, or people?",
    "You’re overloaded. Drop the mess on me in a sentence, and we’ll unpack it together."
  ],
  low: [
    "I’m sorry you’re having a rough one. You don’t have to carry it alone — what’s the part you want help with?",
    "That’s heavy, and I hear you. Do you want distraction (work stuff) or support (talk it out a bit)?",
    "I’m here with you. Start with a small piece of what’s going on, and we’ll move gently."
  ]
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function detectMood(userText) {
  const text = (userText || "").toLowerCase();

  if (/(tired|exhausted|drained|wiped|burnt out|burned out)/.test(text)) return 'tired';
  if (/(stressed|overwhelmed|under pressure|nothing is working|annoyed|frustrated)/.test(text)) return 'stressed';
  if (/(sad|low|down|rough day|not good|terrible|awful|bad)/.test(text)) return 'low';
  if (/(great|good|awesome|fine|okay|ok|not bad|pretty good|energized|pumped)/.test(text)) return 'positive';
  if (/(okay|ok|same as usual|normal)/.test(text)) return 'neutral';

  return 'neutral';
}

function isSimpleGreeting(message) {
  const text = (message || "").toLowerCase().trim();
  if (!text) return false;

  const core = text.replace(/[!.,?]+$/g, '').trim();

  const pureGreetings = [
    "hi", "hey", "hello",
    "hi nyx", "hey nyx", "hello nyx",
    "good morning", "good afternoon", "good evening"
  ];

  return pureGreetings.includes(core);
}

function isHowAreYou(message) {
  const text = (message || "").toLowerCase();
  return /how\s+are\s+you/.test(text) || /how'?s\s+it\s+going/.test(text);
}

function isHowIsYourDay(message) {
  const text = (message || "").toLowerCase();
  return /how\s+is\s+your\s+day/.test(text) ||
         /how'?s\s+your\s+day/.test(text) ||
         /how'?s\s+your\s+day\s+going/.test(text);
}

// Rough detector: user is describing how they are, not asking a question
function looksLikeMoodReply(message) {
  const text = (message || "").toLowerCase().trim();
  if (!text) return false;

  if (text.includes('?')) return false;

  if (text.length <= 80) {
    if (/(tired|exhausted|drained|wiped|burnt out|burned out)/.test(text)) return true;
    if (/(stressed|overwhelmed|under pressure|annoyed|frustrated|nothing is working)/.test(text)) return true;
    if (/(sad|low|down|rough day|not good|bad|terrible|awful)/.test(text)) return true;
    if (/(great|good|awesome|fine|okay|ok|not bad|pretty good|energized|pumped)/.test(text)) return true;
  }

  return false;
}

/**
 * Front-door handler for Nyx:
 * - Short greetings (“hi”, “hello”, etc.)
 * - “How are you?”
 * - “How is your day?”
 * - Short mood replies (“I’m tired”, “I’m good”, etc.)
 *
 * If it handles the message, we skip the OpenAI call and return a local reply.
 */
function maybeHandleFrontDoor(message, meta) {
  const userText = (message || "").trim();
  if (!userText) {
    return { handled: false };
  }

  const isFirstVisit = meta && meta.firstVisit === true;

  if (isFirstVisit && isSimpleGreeting(userText)) {
    return {
      handled: true,
      reply: pickRandom(nyxGreetings.firstVisit),
      domain: "general",
      mode: "front-door:first-visit"
    };
  }

  if (isSimpleGreeting(userText)) {
    return {
      handled: true,
      reply: pickRandom(nyxGreetings.onHello),
      domain: "general",
      mode: "front-door:greeting"
    };
  }

  if (isHowAreYou(userText)) {
    return {
      handled: true,
      reply: pickRandom(nyxGreetings.howAreYou),
      domain: "general",
      mode: "front-door:how-are-you"
    };
  }

  if (isHowIsYourDay(userText)) {
    return {
      handled: true,
      reply: pickRandom(nyxGreetings.howIsYourDay),
      domain: "general",
      mode: "front-door:how-is-your-day"
    };
  }

  if (looksLikeMoodReply(userText)) {
    const mood = detectMood(userText);
    const options = nyxMoodResponses[mood] || nyxMoodResponses.neutral;
    return {
      handled: true,
      reply: pickRandom(options),
      domain: "general",
      mode: "front-door:mood",
      mood
    };
  }

  return { handled: false };
}

// ----------------------
// DOMAIN DETECTOR
// ----------------------
function detectDomain(message) {
  const lower = (message || "").toLowerCase();
  if (lower.includes("tv") || lower.includes("lineup") || lower.includes("grid")) return "tv";
  if (lower.includes("radio") || lower.includes("listener")) return "radio";
  if (lower.includes("stream") || lower.includes("ott") || lower.includes("roku") || lower.includes("app")) return "streaming";
  if (lower.includes("sponsor") || lower.includes("advertis") || lower.includes("ad ") || lower.includes("ads ") || lower.includes("brand")) return "sponsors";
  if (lower.includes("news canada") || (lower.includes("news") && lower.includes("sandblast"))) return "news";
  if (lower.includes("ai") || lower.includes("automation") || lower.includes("agent") || lower.includes("consult")) return "ai";
  return "general";
}

// ----------------------
// ROOT + HEALTH
// ----------------------
app.get('/', (req, res) => {
  res.send("Sandblast backend is alive. Nyx is standing by.");
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    openAIConfigured: Boolean(OPENAI_API_KEY),
    elevenLabsConfigured: Boolean(ELEVENLABS_API_KEY),
    voiceConfigured: Boolean(NYX_VOICE_ID)
  });
});

// ----------------------
// MAIN BRAIN ENDPOINT
// ----------------------
app.post('/api/sandblast-gpt', async (req, res) => {
  try {
    const { message, meta } = req.body || {};
    const userMessage = (message || "").trim();

    if (!userMessage) {
      return res.status(400).json({
        error: "MESSAGE_REQUIRED",
        reply: "I’m here, but I need something to respond to."
      });
    }

    if (!OPENAI_API_KEY) {
      console.error("[/api/sandblast-gpt] Missing OPENAI_API_KEY");
      return res.status(500).json({
        error: "MISSING_OPENAI_API_KEY",
        message: "Nyx can't think clearly without her OpenAI key configured."
      });
    }

    const frontDoor = maybeHandleFrontDoor(userMessage, meta || null);
    if (frontDoor.handled) {
      return res.json({
        ok: true,
        reply: frontDoor.reply,
        domain: frontDoor.domain || "general",
        frontDoorMode: frontDoor.mode || null,
        mood: frontDoor.mood || null
      });
    }

    const domainHint = detectDomain(userMessage);

    const payload = {
      message: userMessage,
      meta: meta || null,
      domainHint
    };

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(payload) }
    ];

    const completion = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        timeout: 15000
      }
    );

    const reply =
      completion.data &&
      completion.data.choices &&
      completion.data.choices[0] &&
      completion.data.choices[0].message &&
      completion.data.choices[0].message.content
        ? completion.data.choices[0].message.content
        : "Nyx is here, but that came through a little fuzzy. Try asking again another way.";

    return res.json({
      ok: true,
      reply,
      domain: domainHint
    });
  } catch (err) {
    console.error("[/api/sandblast-gpt] Error:", err?.response?.data || err);
    return res.status(500).json({
      error: "SANDBLAST_GPT_FAILED",
      message: "Nyx hit a backend snag."
    });
  }
});

// ----------------------
// TTS ENDPOINT
// ----------------------
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceId } = req.body || {};
    const trimmed = (text || "").trim();

    if (!trimmed) {
      return res.status(400).json({ error: "TEXT_REQUIRED" });
    }
    if (!ELEVENLABS_API_KEY) {
      console.error("[/api/tts] Missing ELEVENLABS_API_KEY");
      return res.status(500).json({ error: "MISSING_ELEVENLABS_API_KEY" });
    }

    const selectedVoice = voiceId || NYX_VOICE_ID;
    if (!selectedVoice) {
      console.error("[/api/tts] Missing NYX_VOICE_ID");
      return res.status(500).json({ error: "MISSING_NYX_VOICE_ID" });
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`;

    const response = await axios({
      method: "POST",
      url,
      responseType: "arraybuffer",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      data: {
        text: trimmed,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8
        }
      },
      timeout: 20000
    });

    const audioBase64 = Buffer.from(response.data).toString("base64");

    return res.json({
      success: true,
      contentType: "audio/mpeg",
      audioBase64
    });
  } catch (err) {
    console.error("[/api/tts] TTS error:", err?.response?.data || err);
    return res.status(500).json({
      error: "TTS_FAILED",
      details: err?.response?.data || null
    });
  }
});

// ----------------------
// START SERVER
// ----------------------
app.listen(PORT, () => {
  console.log(`Sandblast backend running on port ${PORT}`);
});

// Optional export for testing
module.exports = app;

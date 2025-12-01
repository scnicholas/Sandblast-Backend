// =======================================================
// Sandblast Backend - Full Version with ElevenLabs TTS
// (No node-fetch import; uses global fetch in Node 18+)
// =======================================================

const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Port
const PORT = process.env.PORT || 3000;

// -------------------------------------------------------
// Environment Variables (Render will supply these)
// -------------------------------------------------------
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// -------------------------------------------------------
// Helper: ElevenLabs Text-To-Speech → returns data URL
// -------------------------------------------------------
async function generateVoiceAudio(text, persona) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    console.warn("ElevenLabs not configured. Skipping TTS.");
    return null;
  }

  const voiceId = ELEVENLABS_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("ElevenLabs error:", response.status, errText);
      return null;
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");

    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (err) {
    console.error("Error calling ElevenLabs:", err);
    return null;
  }
}

// -------------------------------------------------------
// LAYER 1: Quick Local Routing
// -------------------------------------------------------
function handleQuickLocalReply({ message, persona }) {
  const lower = (message || "").toLowerCase();

  // TV
  if (lower.includes("tv")) {
    return {
      handled: true,
      reply:
        "Sandblast TV runs themed retro programming: detectives, westerns, adventure serials and family classics. Check the lineup on the TV page."
    };
  }

  // Radio
  if (lower.includes("radio")) {
    return {
      handled: true,
      reply:
        "Sandblast Radio runs live blocks including specialty, retro, and Gospel Sunday. Let me know your mood and I’ll suggest a block."
    };
  }

  // Streaming
  if (lower.includes("stream") || lower.includes("on demand")) {
    return {
      handled: true,
      reply:
        "Sandblast Streaming gives you retro shows on your schedule. Start with a 60–90 minute block to explore."
    };
  }

  // News Canada
  if (lower.includes("news canada") || (lower.includes("news") && lower.includes("canada"))) {
    return {
      handled: true,
      reply:
        "Sandblast × News Canada highlights Canadian stories and sponsored editorial content. Tell me your audience and I can suggest what fits."
    };
  }

  // Advertising / Sponsorship
  if (
    lower.includes("advertis") ||
    lower.includes("sponsor") ||
    lower.includes("promotion") ||
    lower.includes("promote")
  ) {
    return {
      handled: true,
      reply:
        "Sandblast offers TV, radio, and digital promotional spots. Tell me your business type and monthly budget to get a custom starter mix."
    };
  }

  // Public Domain / Rights
  if (
    lower.includes("public domain") ||
    lower.includes("pd ") ||
    lower.includes("copyright") ||
    lower.includes("rights")
  ) {
    return {
      handled: true,
      reply:
        "PD Watchdog mode: We check year, renewal records, PD databases, and Archive.org notes. Give me a title and year and I’ll walk you through it."
    };
  }

  // Persona quick replies
  if (persona === "vera") {
    return {
      handled: true,
      reply:
        "You’re in Vera mode—steady, focused, and one step at a time. Tell me the next task and we’ll secure it."
    };
  }

  if (persona === "dj_nova") {
    return {
      handled: true,
      reply:
        "DJ Nova on deck. Want an intro? Detective, western, adventure, or Sunday vibe—pick one."
    };
  }

  return { handled: false, reply: null };
}

// -------------------------------------------------------
// LAYER 2: Backend Brain (Temporary Stub)
// -------------------------------------------------------
async function callSandblastBrain({ message, persona, context, session_id }) {
  return (
    `Backend brain received: "${message}". ` +
    `This is the temporary logic layer before full OpenAI integration.`
  );
}

// -------------------------------------------------------
// Health Check
// -------------------------------------------------------
app.get('/', (req, res) => {
  res.status(200).send('Sandblast backend is alive on Render.\n');
});

// -------------------------------------------------------
// Main API: /api/sandblast-gpt
// -------------------------------------------------------
app.post('/api/sandblast-gpt', async (req, res) => {
  try {
    const {
      message = "",
      persona = "sandblast_assistant",
      context = "homepage",
      session_id = null
    } = req.body || {};

    // ---------------------------------------------------
    // LAYER 1 Routing
    // ---------------------------------------------------
    const local = handleQuickLocalReply({ message, persona });

    if (local.handled) {
      const audioUrl = await generateVoiceAudio(local.reply, persona);

      return res.json({
        source: "local-routing",
        reply: local.reply,
        voice: {
          shouldSpeak: !!audioUrl,
          audioUrl
        }
      });
    }

    // ---------------------------------------------------
    // LAYER 2 Brain
    // ---------------------------------------------------
    const brainReply = await callSandblastBrain({
      message,
      persona,
      context,
      session_id
    });

    const audioUrl = await generateVoiceAudio(brainReply, persona);

    return res.json({
      source: "backend-brain",
      reply: brainReply,
      voice: {
        shouldSpeak: !!audioUrl,
        audioUrl
      }
    });

  } catch (err) {
    console.error("Error in /api/sandblast-gpt:", err);

    return res.status(500).json({
      source: "error",
      reply: "Something went wrong in the Sandblast backend.",
      voice: {
        shouldSpeak: false,
        audioUrl: null
      }
    });
  }
});

// -------------------------------------------------------
// Start Server
// -------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Sandblast backend listening on port ${PORT}`);
});

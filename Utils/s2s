"use strict";

/**
 * Utils/s2s.js
 * ElevenLabs Speech-to-Text (Scribe) + local Nyx reply generation.
 *
 * Exports:
 *   handle({ audioBuffer, mimeType, session, sessionId }) -> { transcript, reply, audioBytes?, audioMime?, sessionPatch? }
 *
 * Requirements:
 *   - ELEVENLABS_API_KEY must be set in env
 *
 * Optional env:
 *   - ELEVENLABS_STT_MODEL_ID (default "scribe_v1")
 *   - ELEVENLABS_STT_LANGUAGE_CODE (default "" -> auto-detect)
 *   - ELEVENLABS_STT_DIARIZE (default "false")
 *   - ELEVENLABS_STT_TAG_AUDIO_EVENTS (default "true")
 *   - ELEVENLABS_BASE_URL (default "https://api.elevenlabs.io")
 */

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

const STT_MODEL_ID = process.env.ELEVENLABS_STT_MODEL_ID || "scribe_v1";
const STT_LANGUAGE_CODE = process.env.ELEVENLABS_STT_LANGUAGE_CODE || ""; // empty => auto-detect
const STT_DIARIZE = (process.env.ELEVENLABS_STT_DIARIZE || "false") === "true";
const STT_TAG_AUDIO_EVENTS = (process.env.ELEVENLABS_STT_TAG_AUDIO_EVENTS || "true") === "true";

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function safeRequire(p) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(p);
  } catch (_) {
    return null;
  }
}

// Use the same routing order as /api/chat
const musicMoments = safeRequire("./musicMoments");      // Utils/musicMoments.js
const musicKnowledge = safeRequire("./musicKnowledge");  // Utils/musicKnowledge.js

/**
 * Transcribe audio via ElevenLabs STT
 * Endpoint: POST https://api.elevenlabs.io/v1/speech-to-text  (multipart/form-data)
 * Uses Scribe (scribe_v1) by default. :contentReference[oaicite:2]{index=2}
 */
async function elevenLabsTranscribe(audioBuffer, mimeType) {
  if (!ELEVENLABS_API_KEY) {
    return { ok: false, error: "STT_NOT_CONFIGURED", detail: "Missing ELEVENLABS_API_KEY" };
  }

  const url = `${ELEVENLABS_BASE_URL}/v1/speech-to-text`;

  // Node 18+ has global FormData/Blob via undici
  const form = new FormData();

  // Required
  form.append("model_id", STT_MODEL_ID);

  // Optional knobs (match docs/quickstart parameters conceptually) :contentReference[oaicite:3]{index=3}
  form.append("tag_audio_events", String(STT_TAG_AUDIO_EVENTS));
  form.append("diarize", String(STT_DIARIZE));

  // If language_code is empty, ElevenLabs will detect automatically (per docs guidance) :contentReference[oaicite:4]{index=4}
  if (cleanText(STT_LANGUAGE_CODE)) {
    form.append("language_code", cleanText(STT_LANGUAGE_CODE));
  }

  const safeMime = cleanText(mimeType) || "audio/webm";
  const blob = new Blob([audioBuffer], { type: safeMime });

  // Field name MUST be "file" to match ElevenLabs STT expectations
  // Filename is helpful but not strictly required.
  form.append("file", blob, "nyx_audio.webm");

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      // NOTE: Do NOT set Content-Type manually; FormData will set boundary correctly.
      Accept: "application/json",
    },
    body: form,
  });

  const text = await r.text().catch(() => "");
  if (!r.ok) {
    return {
      ok: false,
      error: `ELEVENLABS_STT_${r.status}`,
      detail: text.slice(0, 600),
    };
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    return { ok: false, error: "ELEVENLABS_STT_BAD_JSON", detail: text.slice(0, 600) };
  }

  // Be defensive: ElevenLabs may return different shapes depending on options.
  // Common fields we attempt:
  // - json.text
  // - json.transcript
  // - json.transcription
  // - json.segments[].text
  // - json.words[].word (fallback)
  const transcript =
    cleanText(json.text) ||
    cleanText(json.transcript) ||
    cleanText(json.transcription) ||
    (Array.isArray(json.segments) ? cleanText(json.segments.map((s) => s.text).join(" ")) : "") ||
    (Array.isArray(json.words) ? cleanText(json.words.map((w) => w.word || w.text || "").join(" ")) : "") ||
    "";

  return { ok: true, transcript, raw: json };
}

/**
 * Generate Nyx reply using local handlers (same order as /api/chat)
 */
function runLocalChat(transcript, session) {
  const msg = cleanText(transcript);
  if (!msg) {
    return {
      reply: "I didn’t catch that. Tap the mic again and speak a bit more clearly.",
      sessionPatch: { lastInputMode: "voice" },
    };
  }

  // 1) Curated moments first
  if (musicMoments && typeof musicMoments.handle === "function") {
    try {
      const out = musicMoments.handle(msg, session);
      if (out && out.reply) {
        if (out.sessionPatch && typeof out.sessionPatch === "object") {
          Object.assign(session, out.sessionPatch);
        }
        return {
          reply: out.reply,
          followUp: out.followUp || null,
          sessionPatch: { lastInputMode: "voice" },
        };
      }
    } catch (_) {
      // fall through
    }
  }

  // 2) Fallback to musicKnowledge
  if (musicKnowledge && typeof musicKnowledge.handleChat === "function") {
    try {
      const out = musicKnowledge.handleChat({ text: msg, session });
      if (out && out.reply) {
        if (out.sessionPatch && typeof out.sessionPatch === "object") {
          Object.assign(session, out.sessionPatch);
        }
        return {
          reply: out.reply,
          followUp: out.followUp || null,
          sessionPatch: { lastInputMode: "voice" },
        };
      }
    } catch (_) {
      // fall through
    }
  }

  return {
    reply: "Say a year (1950–2024), or say “top 10 1950”, “story moment 1950”, or “micro moment 1950”.",
    sessionPatch: { lastInputMode: "voice" },
  };
}

module.exports = {
  /**
   * Main entry used by /api/s2s
   */
  handle: async ({ audioBuffer, mimeType, session }) => {
    // Basic validation
    if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length < 500) {
      return {
        transcript: "",
        reply: "I didn’t get enough audio. Tap the mic again and speak for a second longer.",
        sessionPatch: { lastInputMode: "voice", stt: "short_audio" },
      };
    }

    // 1) STT
    const stt = await elevenLabsTranscribe(audioBuffer, mimeType);
    if (!stt.ok) {
      return {
        transcript: "",
        reply:
          "Voice capture is working, but transcription failed on the server. If this keeps happening, it’s usually an API key or file format issue.",
        sessionPatch: { lastInputMode: "voice", stt: "error", sttError: stt.error },
      };
    }

    // 2) Local chat reply (no HTTP hop)
    const transcript = cleanText(stt.transcript);
    const chat = runLocalChat(transcript, session);

    return {
      transcript,
      reply: cleanText(chat.reply),
      sessionPatch: Object.assign(
        { lastInputMode: "voice", stt: "ok" },
        chat.sessionPatch || {}
      ),
    };
  },
};

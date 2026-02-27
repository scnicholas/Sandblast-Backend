"use strict";

/**
 * Utils/s2s.js
 * ElevenLabs Speech-to-Text (Scribe) + local Nyx reply generation.
 *
 * Enhancements (no structural changes):
 *  - Add request timeouts + abort (prevents hanging calls hurting "efficiency %")
 *  - Add lightweight telemetry (sttMs, totalMs, bytes, mime, traceId)
 *  - Add safe retry-once for transient 429/5xx STT failures
 *  - Add stricter validation + size guardrails
 *  - Preserve existing exports + return shape (adds optional meta fields only)
 *
 * Exports:
 *   handle({ audioBuffer, mimeType, session, sessionId }) -> { transcript, reply, audioBytes?, audioMime?, sessionPatch?, meta? }
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
 *   - ELEVENLABS_STT_TIMEOUT_MS (default "12000")
 *   - ELEVENLABS_STT_RETRY_ONCE (default "true")
 *   - ELEVENLABS_STT_MAX_BYTES (default "8000000" ~ 8MB)
 */

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

const STT_MODEL_ID = process.env.ELEVENLABS_STT_MODEL_ID || "scribe_v1";
const STT_LANGUAGE_CODE = process.env.ELEVENLABS_STT_LANGUAGE_CODE || ""; // empty => auto-detect
const STT_DIARIZE = (process.env.ELEVENLABS_STT_DIARIZE || "false") === "true";
const STT_TAG_AUDIO_EVENTS = (process.env.ELEVENLABS_STT_TAG_AUDIO_EVENTS || "true") === "true";

const STT_TIMEOUT_MS = Math.max(
  2000,
  Math.min(parseInt(process.env.ELEVENLABS_STT_TIMEOUT_MS || "12000", 10) || 12000, 45000)
);
const STT_RETRY_ONCE = (process.env.ELEVENLABS_STT_RETRY_ONCE || "true") !== "false";
const STT_MAX_BYTES = Math.max(
  250000,
  Math.min(parseInt(process.env.ELEVENLABS_STT_MAX_BYTES || "8000000", 10) || 8000000, 25000000)
);

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

function makeTraceId() {
  // short, log-friendly; not cryptographic
  const rnd = Math.random().toString(16).slice(2);
  const t = Date.now().toString(16);
  return `s2s_${t}_${rnd.slice(0, 8)}`;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function normalizeMime(mimeType) {
  const m = cleanText(mimeType).toLowerCase();
  if (!m) return "audio/webm";
  // common captures
  if (m.includes("webm")) return "audio/webm";
  if (m.includes("ogg")) return "audio/ogg";
  if (m.includes("wav")) return "audio/wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "audio/mpeg";
  if (m.includes("mp4")) return "audio/mp4";
  return m;
}

async function fetchWithTimeout(url, opts, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, Object.assign({}, opts, { signal: ac.signal }));
    return res;
  } finally {
    clearTimeout(t);
  }
}

// Use the same routing order as /api/chat
const musicMoments = safeRequire("./musicMoments"); // Utils/musicMoments.js
const musicKnowledge = safeRequire("./musicKnowledge"); // Utils/musicKnowledge.js

/**
 * Transcribe audio via ElevenLabs STT
 * Endpoint: POST https://api.elevenlabs.io/v1/speech-to-text  (multipart/form-data)
 * Uses Scribe (scribe_v1) by default.
 */
async function elevenLabsTranscribe(audioBuffer, mimeType, traceId) {
  if (!ELEVENLABS_API_KEY) {
    return { ok: false, error: "STT_NOT_CONFIGURED", detail: "Missing ELEVENLABS_API_KEY" };
  }

  const url = `${ELEVENLABS_BASE_URL}/v1/speech-to-text`;

  // Node 18+ has global FormData/Blob via undici
  const form = new FormData();

  // Required
  form.append("model_id", STT_MODEL_ID);

  // Optional knobs
  form.append("tag_audio_events", String(STT_TAG_AUDIO_EVENTS));
  form.append("diarize", String(STT_DIARIZE));

  // If language_code is empty, ElevenLabs will detect automatically
  if (cleanText(STT_LANGUAGE_CODE)) {
    form.append("language_code", cleanText(STT_LANGUAGE_CODE));
  }

  const safeMime = normalizeMime(mimeType);
  const blob = new Blob([audioBuffer], { type: safeMime });

  // Field name MUST be "file" to match ElevenLabs STT expectations
  // Filename is helpful but not strictly required.
  const filename = safeMime.includes("wav") ? "nyx_audio.wav" : "nyx_audio.webm";
  form.append("file", blob, filename);

  const t0 = Date.now();
  const r = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "x-sb-trace-id": traceId,
        // NOTE: Do NOT set Content-Type manually; FormData will set boundary correctly.
        Accept: "application/json",
      },
      body: form,
    },
    STT_TIMEOUT_MS
  ).catch((e) => {
    const msg = String(e && e.name ? e.name : e);
    return { __sb_abort: true, __sb_error: msg };
  });

  if (r && r.__sb_abort) {
    return {
      ok: false,
      error: "ELEVENLABS_STT_TIMEOUT",
      detail: `STT request aborted (${r.__sb_error || "timeout"})`,
      ms: Date.now() - t0,
    };
  }

  const text = await r.text().catch(() => "");
  const ms = Date.now() - t0;

  if (!r.ok) {
    return {
      ok: false,
      error: `ELEVENLABS_STT_${r.status}`,
      detail: text.slice(0, 800),
      ms,
      status: r.status,
    };
  }

  const json = safeJsonParse(text);
  if (!json) {
    return { ok: false, error: "ELEVENLABS_STT_BAD_JSON", detail: text.slice(0, 800), ms, status: r.status };
  }

  // Be defensive: ElevenLabs may return different shapes depending on options.
  const transcript =
    cleanText(json.text) ||
    cleanText(json.transcript) ||
    cleanText(json.transcription) ||
    (Array.isArray(json.segments) ? cleanText(json.segments.map((s) => s.text).join(" ")) : "") ||
    (Array.isArray(json.words) ? cleanText(json.words.map((w) => w.word || w.text || "").join(" ")) : "") ||
    "";

  return { ok: true, transcript, raw: json, ms };
}

function isRetryableSttError(sttErr) {
  const code = String(sttErr || "");
  // transient: rate limit / gateway / server errors / timeout
  return (
    code === "ELEVENLABS_STT_TIMEOUT" ||
    code.startsWith("ELEVENLABS_STT_429") ||
    code.startsWith("ELEVENLABS_STT_500") ||
    code.startsWith("ELEVENLABS_STT_502") ||
    code.startsWith("ELEVENLABS_STT_503") ||
    code.startsWith("ELEVENLABS_STT_504")
  );
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
   *
   * NOTE: structure preserved; we only add optional meta.telemetry fields.
   */
  handle: async ({ audioBuffer, mimeType, session }) => {
    const traceId = makeTraceId();
    const tStart = Date.now();

    // Basic validation
    if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length < 500) {
      return {
        transcript: "",
        reply: "I didn’t get enough audio. Tap the mic again and speak for a second longer.",
        sessionPatch: { lastInputMode: "voice", stt: "short_audio" },
        meta: {
          traceId,
          telemetry: {
            totalMs: Date.now() - tStart,
            bytes: audioBuffer ? audioBuffer.length : 0,
            mime: normalizeMime(mimeType),
          },
        },
      };
    }

    // Guard: avoid giant uploads (protects server + latency)
    if (audioBuffer.length > STT_MAX_BYTES) {
      return {
        transcript: "",
        reply: "That audio clip is a bit too long. Tap the mic again and keep it under about 15–20 seconds.",
        sessionPatch: { lastInputMode: "voice", stt: "too_large", sttBytes: audioBuffer.length },
        meta: {
          traceId,
          telemetry: {
            totalMs: Date.now() - tStart,
            bytes: audioBuffer.length,
            maxBytes: STT_MAX_BYTES,
            mime: normalizeMime(mimeType),
          },
        },
      };
    }

    // 1) STT (with optional retry-once)
    const safeMime = normalizeMime(mimeType);
    let stt = await elevenLabsTranscribe(audioBuffer, safeMime, traceId);

    if (!stt.ok && STT_RETRY_ONCE && isRetryableSttError(stt.error)) {
      // small backoff to reduce 429 collisions
      await new Promise((r) => setTimeout(r, 250));
      const stt2 = await elevenLabsTranscribe(audioBuffer, safeMime, traceId);
      // keep the better (ok wins; otherwise keep original for debugging)
      if (stt2.ok) stt = stt2;
      else stt.detail = stt.detail || stt2.detail;
      stt._retried = true;
    }

    if (!stt.ok) {
      const totalMs = Date.now() - tStart;
      return {
        transcript: "",
        reply:
          "Voice capture is working, but transcription failed on the server. If this keeps happening, it’s usually an API key, a timeout, or an audio format issue.",
        sessionPatch: { lastInputMode: "voice", stt: "error", sttError: stt.error },
        meta: {
          traceId,
          telemetry: {
            totalMs,
            sttMs: stt.ms || null,
            retried: !!stt._retried,
            bytes: audioBuffer.length,
            mime: safeMime,
            timeoutMs: STT_TIMEOUT_MS,
            sttStatus: stt.status || null,
          },
        },
      };
    }

    // 2) Local chat reply (no HTTP hop)
    const transcript = cleanText(stt.transcript);
    const chat = runLocalChat(transcript, session);

    const totalMs = Date.now() - tStart;

    return {
      transcript,
      reply: cleanText(chat.reply),
      sessionPatch: Object.assign({ lastInputMode: "voice", stt: "ok" }, chat.sessionPatch || {}),
      meta: {
        traceId,
        telemetry: {
          totalMs,
          sttMs: stt.ms || null,
          retried: !!stt._retried,
          bytes: audioBuffer.length,
          mime: safeMime,
          model: STT_MODEL_ID,
          language: cleanText(STT_LANGUAGE_CODE) || "auto",
          diarize: STT_DIARIZE,
          tagAudioEvents: STT_TAG_AUDIO_EVENTS,
        },
      },
    };
  },
};

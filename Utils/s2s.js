"use strict";

/**
 * Utils/s2s.js
 * ElevenLabs Speech-to-Text (Scribe) + local Nyx reply generation.
 *
 * Enhancements (no structural changes to exports/return shape):
 *  - Request timeouts + abort propagation (prevents hanging calls + zombie work)
 *  - Lightweight telemetry (sttMs, totalMs, bytes, mime, traceId, queueWaitMs, cbState)
 *  - Retry-once for transient 429/5xx STT failures (optional)
 *  - Stricter validation + size guardrails
 *  - Reliability Spec v1: concurrency cap + queue timeout + circuit breaker
 *  - Option 2 Observability: Prometheus metrics (prom-client) with safe/no-op fallback
 *  - Preserve existing exports + return shape (adds optional meta fields only)
 *
 * Exports:
 *   handle({ audioBuffer, mimeType, session, sessionId }) -> { transcript, reply, audioBytes?, audioMime?, sessionPatch?, meta? }
 *   getSafeSnapshot() -> optional env snapshot (no secrets)
 *   getMetricsText() -> Prometheus text format (only if prom-client present & enabled)
 *   getMetricsContentType() -> content-type for /metrics
 */

// Optional centralized env config (does not change behavior if missing)
let _envCfg = null;
let _envSnapshotFn = null;
try {
  // eslint-disable-next-line global-require
  const envMod = require("./env");
  if (envMod && envMod.config) _envCfg = envMod.config;
  if (envMod && typeof envMod.getSafeSnapshot === "function") _envSnapshotFn = envMod.getSafeSnapshot;
} catch (_) {
  _envCfg = null;
  _envSnapshotFn = null;
}

const ELEVENLABS_API_KEY = (_envCfg && _envCfg.ELEVENLABS_API_KEY) || process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

const STT_MODEL_ID = process.env.ELEVENLABS_STT_MODEL_ID || "scribe_v1";
const STT_LANGUAGE_CODE = process.env.ELEVENLABS_STT_LANGUAGE_CODE || ""; // empty => auto-detect
const STT_DIARIZE = (process.env.ELEVENLABS_STT_DIARIZE || "false") === "true";
const STT_TAG_AUDIO_EVENTS = (process.env.ELEVENLABS_STT_TAG_AUDIO_EVENTS || "true") === "true";

const STT_TIMEOUT_MS = Math.max(
  2000,
  Math.min(
    parseInt(
      (_envCfg && _envCfg.ELEVENLABS_STT_TIMEOUT_MS) || process.env.ELEVENLABS_STT_TIMEOUT_MS || "12000",
      10
    ) || 12000,
    45000
  )
);

const STT_RETRY_ONCE =
  ((_envCfg && _envCfg.ELEVENLABS_STT_RETRY_ONCE) != null
    ? !!_envCfg.ELEVENLABS_STT_RETRY_ONCE
    : (process.env.ELEVENLABS_STT_RETRY_ONCE || "true") !== "false");

const STT_MAX_BYTES = Math.max(
  250000,
  Math.min(
    parseInt(
      (_envCfg && _envCfg.ELEVENLABS_STT_MAX_BYTES) || process.env.ELEVENLABS_STT_MAX_BYTES || "8000000",
      10
    ) || 8000000,
    25000000
  )
);

/** Reliability Spec v1 knobs (S2S) */
const S2S_MAX_CONCURRENCY = Math.max(1, Math.min(parseInt(process.env.ELEVENLABS_S2S_MAX_CONCURRENCY || "3", 10) || 3, 12));
const S2S_QUEUE_TIMEOUT_MS = Math.max(250, Math.min(parseInt(process.env.ELEVENLABS_S2S_QUEUE_TIMEOUT_MS || "8000", 10) || 8000, 30000));

/** Circuit breaker knobs */
const CB_FAIL_THRESHOLD = Math.max(1, Math.min(parseInt(process.env.ELEVENLABS_S2S_CB_FAIL_THRESHOLD || "5", 10) || 5, 50));
const CB_WINDOW_MS = Math.max(5000, Math.min(parseInt(process.env.ELEVENLABS_S2S_CB_WINDOW_MS || "60000", 10) || 60000, 10 * 60 * 1000));
const CB_OPEN_MS = Math.max(5000, Math.min(parseInt(process.env.ELEVENLABS_S2S_CB_OPEN_MS || "45000", 10) || 45000, 10 * 60 * 1000));

/** Metrics enable (Option 2) */
const METRICS_ENABLED = (process.env.NYX_METRICS_ENABLED || "true") !== "false";

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

/** ------------------------------
 * Option 2 Metrics (prom-client)
 * ------------------------------ */
const prom = METRICS_ENABLED ? safeRequire("prom-client") : null;
let _metrics = null;

function getMetrics() {
  if (_metrics || !prom) return _metrics;

  // Do NOT collect default metrics here automatically (avoids surprises).
  // If you want defaults, do it in index.js.
  const { Histogram, Counter, Gauge, register } = prom;

  const bucketsMs = [25, 50, 75, 100, 150, 250, 400, 600, 800, 1200, 2000, 3500, 5000, 8000, 12000, 20000, 45000];

  const httpDur = new Histogram({
    name: "nyx_http_duration_ms",
    help: "Nyx HTTP handler duration (ms)",
    labelNames: ["service", "route", "status"],
    buckets: bucketsMs,
  });

  const vendorDur = new Histogram({
    name: "nyx_vendor_duration_ms",
    help: "Nyx vendor call duration (ms)",
    labelNames: ["vendor", "op", "status"],
    buckets: bucketsMs,
  });

  const queueWait = new Histogram({
    name: "nyx_queue_wait_ms",
    help: "Nyx queue wait time for concurrency slot (ms)",
    labelNames: ["service", "route"],
    buckets: bucketsMs,
  });

  const errors = new Counter({
    name: "nyx_errors_total",
    help: "Nyx errors total (normalized)",
    labelNames: ["service", "vendor", "op", "errCode", "status"],
  });

  const vendorStatus = new Counter({
    name: "nyx_vendor_status_total",
    help: "Nyx vendor status codes total",
    labelNames: ["vendor", "op", "status"],
  });

  const cbState = new Gauge({
    name: "nyx_cb_state",
    help: "Nyx circuit breaker state (0=closed, 1=open)",
    labelNames: ["service", "vendor", "op"],
  });

  const inflight = new Gauge({
    name: "nyx_inflight",
    help: "Nyx in-flight requests",
    labelNames: ["service", "route"],
  });

  const queueDepth = new Gauge({
    name: "nyx_queue_depth",
    help: "Nyx queue depth for concurrency slots",
    labelNames: ["service", "route"],
  });

  _metrics = {
    register,
    httpDur,
    vendorDur,
    queueWait,
    errors,
    vendorStatus,
    cbState,
    inflight,
    queueDepth,
    contentType: register.contentType,
  };
  return _metrics;
}

function getMetricsText() {
  const m = getMetrics();
  if (!m) return "";
  return m.register.metrics();
}

function getMetricsContentType() {
  const m = getMetrics();
  return m ? m.contentType : "text/plain; version=0.0.4; charset=utf-8";
}

/** ------------------------------
 * Reliability Spec v1 primitives
 * ------------------------------ */
const _sem = {
  inFlight: 0,
  queue: [],
};

async function acquireSlot(routeLabel) {
  const start = Date.now();
  const m = getMetrics();

  // immediate acquisition
  if (_sem.inFlight < S2S_MAX_CONCURRENCY) {
    _sem.inFlight += 1;
    if (m) {
      m.inflight.labels("s2s", routeLabel).set(_sem.inFlight);
      m.queueDepth.labels("s2s", routeLabel).set(_sem.queue.length);
      m.queueWait.labels("s2s", routeLabel).observe(0);
    }
    return { ok: true, waitedMs: 0 };
  }

  // queue
  return await new Promise((resolve) => {
    const item = {
      done: false,
      routeLabel,
      resolve,
      timer: null,
      start,
    };

    item.timer = setTimeout(() => {
      if (item.done) return;
      item.done = true;
      // remove from queue if still present
      const idx = _sem.queue.indexOf(item);
      if (idx >= 0) _sem.queue.splice(idx, 1);

      const waitedMs = Date.now() - start;
      if (m) {
        m.queueDepth.labels("s2s", routeLabel).set(_sem.queue.length);
        m.queueWait.labels("s2s", routeLabel).observe(waitedMs);
      }
      resolve({ ok: false, waitedMs, reason: "QUEUE_TIMEOUT" });
    }, S2S_QUEUE_TIMEOUT_MS);

    _sem.queue.push(item);
    if (m) m.queueDepth.labels("s2s", routeLabel).set(_sem.queue.length);
  }).then((res) => {
    // If we resolved due to grant, waitedMs will be set then.
    return res;
  });
}

function releaseSlot(routeLabel) {
  const m = getMetrics();
  _sem.inFlight = Math.max(0, _sem.inFlight - 1);

  // grant next waiter
  while (_sem.queue.length && _sem.inFlight < S2S_MAX_CONCURRENCY) {
    const next = _sem.queue.shift();
    if (!next || next.done) continue;
    next.done = true;
    if (next.timer) clearTimeout(next.timer);

    _sem.inFlight += 1;
    const waitedMs = Date.now() - next.start;
    if (m) {
      m.inflight.labels("s2s", next.routeLabel).set(_sem.inFlight);
      m.queueDepth.labels("s2s", next.routeLabel).set(_sem.queue.length);
      m.queueWait.labels("s2s", next.routeLabel).observe(waitedMs);
    }
    next.resolve({ ok: true, waitedMs });
    break;
  }

  if (m) {
    m.inflight.labels("s2s", routeLabel).set(_sem.inFlight);
    m.queueDepth.labels("s2s", routeLabel).set(_sem.queue.length);
  }
}

/** Circuit breaker (simple rolling-window) */
const _cb = {
  openedUntil: 0,
  failureTs: [], // timestamps within CB_WINDOW_MS
};

function cbIsOpen(now) {
  return now < _cb.openedUntil;
}

function cbStateValue(now) {
  return cbIsOpen(now) ? 1 : 0;
}

function cbRecordFailure(now) {
  // prune window
  const cutoff = now - CB_WINDOW_MS;
  _cb.failureTs = _cb.failureTs.filter((t) => t >= cutoff);
  _cb.failureTs.push(now);

  if (_cb.failureTs.length >= CB_FAIL_THRESHOLD) {
    _cb.openedUntil = now + CB_OPEN_MS;
    _cb.failureTs = []; // reset after opening
  }
}

function cbRecordSuccess(now) {
  // On success, we can slowly recover by pruning old failures.
  const cutoff = now - CB_WINDOW_MS;
  _cb.failureTs = _cb.failureTs.filter((t) => t >= cutoff);
}

function normalizeErrCode({ status, aborted, timeout, cbOpen, notConfigured } = {}) {
  if (notConfigured) return "NOT_CONFIGURED";
  if (cbOpen) return "CB_OPEN";
  if (aborted) return "ABORTED";
  if (timeout) return "TIMEOUT";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500 && status <= 599) return "VENDOR_5XX";
  if (status >= 400 && status <= 499) return "VENDOR_4XX";
  return "UNKNOWN";
}

/** Abort-aware fetch: supports timeout AND external abort signal */
async function fetchWithTimeout(url, opts, timeoutMs, externalSignal) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  let onAbort = null;
  if (externalSignal && typeof externalSignal.addEventListener === "function") {
    onAbort = () => ac.abort();
    try {
      externalSignal.addEventListener("abort", onAbort, { once: true });
    } catch (_) {
      // ignore
    }
  }

  try {
    const res = await fetch(url, Object.assign({}, opts, { signal: ac.signal }));
    return res;
  } finally {
    clearTimeout(t);
    if (externalSignal && onAbort) {
      try {
        externalSignal.removeEventListener("abort", onAbort);
      } catch (_) {
        // ignore
      }
    }
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
async function elevenLabsTranscribe(audioBuffer, mimeType, traceId, abortSignal) {
  if (!ELEVENLABS_API_KEY) {
    return { ok: false, error: "STT_NOT_CONFIGURED", detail: "Missing ELEVENLABS_API_KEY", notConfigured: true };
  }

  const now = Date.now();
  const m = getMetrics();
  if (m) m.cbState.labels("s2s", "elevenlabs", "stt").set(cbStateValue(now));

  if (cbIsOpen(now)) {
    return { ok: false, error: "S2S_CB_OPEN", detail: "Circuit breaker open; vendor calls suppressed", cbOpen: true };
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

  // Field name MUST be "file"
  const filename = safeMime.includes("wav") ? "nyx_audio.wav" : "nyx_audio.webm";
  form.append("file", blob, filename);

  const t0 = Date.now();
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "x-sb-trace-id": traceId,
        Accept: "application/json",
      },
      body: form,
    },
    STT_TIMEOUT_MS,
    abortSignal
  ).catch((e) => {
    const msg = String(e && e.name ? e.name : e);
    return { __sb_abort: true, __sb_error: msg };
  });

  const ms = Date.now() - t0;

  // Vendor latency metric
  if (m) m.vendorDur.labels("elevenlabs", "stt", String(res && res.status ? res.status : "0")).observe(ms);

  if (res && res.__sb_abort) {
    cbRecordFailure(Date.now());
    if (m) {
      m.vendorStatus.labels("elevenlabs", "stt", "0").inc();
      m.errors.labels("s2s", "elevenlabs", "stt", normalizeErrCode({ timeout: true }), "0").inc();
      m.cbState.labels("s2s", "elevenlabs", "stt").set(cbStateValue(Date.now()));
    }
    return {
      ok: false,
      error: "ELEVENLABS_STT_TIMEOUT",
      detail: `STT request aborted (${res.__sb_error || "timeout"})`,
      ms,
      status: 0,
      timeout: true,
    };
  }

  // We have a real response
  const status = res.status || 0;
  if (m) m.vendorStatus.labels("elevenlabs", "stt", String(status)).inc();

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    cbRecordFailure(Date.now());
    if (m) {
      m.errors.labels("s2s", "elevenlabs", "stt", normalizeErrCode({ status }), String(status)).inc();
      m.cbState.labels("s2s", "elevenlabs", "stt").set(cbStateValue(Date.now()));
    }
    return {
      ok: false,
      error: `ELEVENLABS_STT_${status}`,
      detail: text.slice(0, 800),
      ms,
      status,
    };
  }

  // success
  cbRecordSuccess(Date.now());
  if (m) m.cbState.labels("s2s", "elevenlabs", "stt").set(cbStateValue(Date.now()));

  const json = safeJsonParse(text);
  if (!json) {
    // treat malformed response as failure
    cbRecordFailure(Date.now());
    if (m) m.errors.labels("s2s", "elevenlabs", "stt", "BAD_JSON", String(status)).inc();
    return { ok: false, error: "ELEVENLABS_STT_BAD_JSON", detail: text.slice(0, 800), ms, status };
  }

  const transcript =
    cleanText(json.text) ||
    cleanText(json.transcript) ||
    cleanText(json.transcription) ||
    (Array.isArray(json.segments) ? cleanText(json.segments.map((s) => s.text).join(" ")) : "") ||
    (Array.isArray(json.words) ? cleanText(json.words.map((w) => w.word || w.text || "").join(" ")) : "") ||
    "";

  return { ok: true, transcript, raw: json, ms, status };
}

function isRetryableSttError(sttErr) {
  const code = String(sttErr || "");
  return (
    code === "ELEVENLABS_STT_TIMEOUT" ||
    code === "S2S_CB_OPEN" ||
    code.startsWith("ELEVENLABS_STT_429") ||
    code.startsWith("ELEVENLABS_STT_500") ||
    code.startsWith("ELEVENLABS_STT_502") ||
    code.startsWith("ELEVENLABS_STT_503") ||
    code.startsWith("ELEVENLABS_STT_504")
  );
}

/** Greeting/hospitality micro-logic (Nick/Nyx) */
function detectSocialCheckIn(msg) {
  const s = cleanText(msg).toLowerCase();
  if (!s) return null;

  const isGreeting =
    /\b(hi|hey|hello|good morning|good afternoon|good evening)\b/.test(s) ||
    /\bhowdy\b/.test(s);

  const asksHow =
    /\bhow are (you|u)\b/.test(s) ||
    /\bhow('?s| is) your day\b/.test(s) ||
    /\bhow you doing\b/.test(s) ||
    /\bhope you( are)? (well|okay)\b/.test(s);

  if (isGreeting || asksHow) {
    return { isGreeting, asksHow };
  }
  return null;
}

function pickHospitableReply(session, cue) {
  const variants = [
    "Hello! I’m doing really well — thanks for asking. How are you today?",
    "Hey there 😊 I’m good — I hope your day’s been kind to you. How’s it going on your end?",
    "Hi! I’m doing great. How are you feeling today — energized, stressed, somewhere in between?",
    "Hello! I’m here with you. How’s your day going so far?",
    "Hey! I’m good — and I’m glad you’re here. What do you want to tackle today?",
    "Hi 😊 Thanks for checking in — that’s thoughtful. How are you doing right now?",
  ];

  const last = (session && typeof session.__sb_greet_ix === "number") ? session.__sb_greet_ix : -1;
  let ix = Math.floor(Math.random() * variants.length);
  if (variants.length > 1 && ix === last) ix = (ix + 1) % variants.length;

  if (session && typeof session === "object") session.__sb_greet_ix = ix;

  // Gentle steer if it’s purely greeting
  if (cue && cue.isGreeting && !cue.asksHow) {
    return variants[ix].replace("How are you today?", "How are you today? What are we building or solving?");
  }
  return variants[ix];
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

  // Hospitality / social check-in first (fast-path)
  const cue = detectSocialCheckIn(msg);
  if (cue) {
    return {
      reply: pickHospitableReply(session, cue),
      sessionPatch: { lastInputMode: "voice", social: "greeting" },
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
  // Optional safe config snapshot (no secrets)
  getSafeSnapshot: () => {
    try {
      return _envSnapshotFn ? _envSnapshotFn() : null;
    } catch (_) {
      return null;
    }
  },

  // Option 2: prometheus text (mount this on /metrics in index.js)
  getMetricsText,
  getMetricsContentType,

  /**
   * Main entry used by /api/s2s
   *
   * NOTE: structure preserved; we only add optional meta.telemetry fields.
   */
  handle: async ({ audioBuffer, mimeType, session, abortSignal }) => {
    const routeLabel = "/api/s2s";
    const traceId = makeTraceId();
    const tStart = Date.now();
    const m = getMetrics();

    if (m) m.inflight.labels("s2s", routeLabel).inc();

    // Concurrency cap + queue timeout
    const slot = await acquireSlot(routeLabel);
    if (!slot.ok) {
      if (m) {
        m.errors.labels("s2s", "elevenlabs", "stt", "QUEUE_TIMEOUT", "503").inc();
        m.httpDur.labels("s2s", routeLabel, "503").observe(Date.now() - tStart);
        m.inflight.labels("s2s", routeLabel).dec();
      }
      return {
        transcript: "",
        reply: "Voice is busy for a moment. Try again in a few seconds — I’m still here.",
        sessionPatch: { lastInputMode: "voice", stt: "busy" },
        meta: {
          traceId,
          telemetry: {
            totalMs: Date.now() - tStart,
            queueWaitMs: slot.waitedMs,
            maxConcurrency: S2S_MAX_CONCURRENCY,
            cbState: cbStateValue(Date.now()),
            bytes: audioBuffer ? audioBuffer.length : 0,
            mime: normalizeMime(mimeType),
          },
        },
      };
    }

    const queueWaitMs = slot.waitedMs || 0;

    try {
      // Basic validation
      if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length < 500) {
        if (m) m.httpDur.labels("s2s", routeLabel, "200").observe(Date.now() - tStart);
        return {
          transcript: "",
          reply: "I didn’t get enough audio. Tap the mic again and speak for a second longer.",
          sessionPatch: { lastInputMode: "voice", stt: "short_audio" },
          meta: {
            traceId,
            telemetry: {
              totalMs: Date.now() - tStart,
              queueWaitMs,
              bytes: audioBuffer ? audioBuffer.length : 0,
              mime: normalizeMime(mimeType),
              cbState: cbStateValue(Date.now()),
            },
          },
        };
      }

      // Guard: avoid giant uploads
      if (audioBuffer.length > STT_MAX_BYTES) {
        if (m) m.httpDur.labels("s2s", routeLabel, "200").observe(Date.now() - tStart);
        return {
          transcript: "",
          reply: "That audio clip is a bit too long. Tap the mic again and keep it under about 15–20 seconds.",
          sessionPatch: { lastInputMode: "voice", stt: "too_large", sttBytes: audioBuffer.length },
          meta: {
            traceId,
            telemetry: {
              totalMs: Date.now() - tStart,
              queueWaitMs,
              bytes: audioBuffer.length,
              maxBytes: STT_MAX_BYTES,
              mime: normalizeMime(mimeType),
              cbState: cbStateValue(Date.now()),
            },
          },
        };
      }

      // 1) STT (with optional retry-once)
      const safeMime = normalizeMime(mimeType);
      let stt = await elevenLabsTranscribe(audioBuffer, safeMime, traceId, abortSignal);

      if (!stt.ok && STT_RETRY_ONCE && isRetryableSttError(stt.error)) {
        // If breaker is open, don't hammer; small backoff for 429 collisions
        await new Promise((r) => setTimeout(r, 250));
        const stt2 = await elevenLabsTranscribe(audioBuffer, safeMime, traceId, abortSignal);
        if (stt2.ok) stt = stt2;
        else stt.detail = stt.detail || stt2.detail;
        stt._retried = true;
      }

      if (!stt.ok) {
        const status = stt.status || 0;
        const errCode = normalizeErrCode({
          status,
          timeout: !!stt.timeout,
          cbOpen: !!stt.cbOpen || stt.error === "S2S_CB_OPEN",
          notConfigured: !!stt.notConfigured || stt.error === "STT_NOT_CONFIGURED",
        });

        if (m) {
          m.errors.labels("s2s", "elevenlabs", "stt", errCode, String(status || 503)).inc();
          m.httpDur.labels("s2s", routeLabel, String(status || 503)).observe(Date.now() - tStart);
        }

        return {
          transcript: "",
          reply:
            errCode === "CB_OPEN"
              ? "Voice is temporarily unavailable. I can keep going in text while it stabilizes."
              : "Voice capture is working, but transcription failed on the server. If this keeps happening, it’s usually an API key, a timeout, or an audio format issue.",
          sessionPatch: { lastInputMode: "voice", stt: "error", sttError: stt.error },
          meta: {
            traceId,
            telemetry: {
              totalMs: Date.now() - tStart,
              sttMs: stt.ms || null,
              retried: !!stt._retried,
              queueWaitMs,
              bytes: audioBuffer.length,
              mime: safeMime,
              timeoutMs: STT_TIMEOUT_MS,
              sttStatus: stt.status || null,
              cbState: cbStateValue(Date.now()),
            },
          },
        };
      }

      // 2) Local chat reply (no HTTP hop)
      const transcript = cleanText(stt.transcript);
      const chat = runLocalChat(transcript, session);

      const totalMs = Date.now() - tStart;
      if (m) m.httpDur.labels("s2s", routeLabel, "200").observe(totalMs);

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
            queueWaitMs,
            bytes: audioBuffer.length,
            mime: safeMime,
            model: STT_MODEL_ID,
            language: cleanText(STT_LANGUAGE_CODE) || "auto",
            diarize: STT_DIARIZE,
            tagAudioEvents: STT_TAG_AUDIO_EVENTS,
            cbState: cbStateValue(Date.now()),
            maxConcurrency: S2S_MAX_CONCURRENCY,
          },
        },
      };
    } finally {
      // Release concurrency slot + inflight gauge
      releaseSlot(routeLabel);
      if (m) {
        try { m.inflight.labels("s2s", routeLabel).dec(); } catch (_) {}
      }
    }
  },
};

"use strict";

/**
 * Routes/voiceRoute.js
 *
 * voiceRoute v1.0.0 NORMALIZED-TTS-HARDEN
 * ------------------------------------------------------------
 * PURPOSE
 * - Handle normalized TTS provider failures consistently
 * - Decide retry vs downgrade vs stop in one place
 * - Preserve backend contract integrity for audio and JSON clients
 * - Avoid re-entry loops on terminal audio failures
 */

const tts = require("./tts");
let chatEngine = null;
try { chatEngine = require("./chatEngine"); } catch (_e) { chatEngine = null; }

const VOICE_ROUTE_VERSION = "voiceRoute v1.0.0 NORMALIZED-TTS-HARDEN";
const MAX_RETRY_ATTEMPTS = Math.max(0, Number(process.env.SB_VOICE_ROUTE_MAX_RETRY || 1));

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}
function boolish(v, dflt = false) {
  if (v === true || v === false) return v;
  const s = safeStr(v).trim().toLowerCase();
  if (!s) return dflt;
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return dflt;
}
function pickFirst() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v !== undefined && v !== null && String(v) !== "") return v;
  }
  return "";
}
function setHeaderSafe(res, key, value) {
  try { if (res && !res.headersSent) res.setHeader(key, value); } catch (_e) {}
}
function wantsJson(req) {
  const q = req && req.query && typeof req.query === "object" ? req.query : {};
  const b = req && req.body && typeof req.body === "object" ? req.body : {};
  return boolish(pickFirst(q.returnJson, b.returnJson, q.json, b.json), false);
}
function normalizeInput(req) {
  const body = req && req.body && typeof req.body === "object" ? req.body : {};
  const query = req && req.query && typeof req.query === "object" ? req.query : {};
  const headers = req && req.headers && typeof req.headers === "object" ? req.headers : {};
  return {
    text: safeStr(pickFirst(body.text, body.message, body.prompt, query.text, query.message, query.prompt)),
    textDisplay: safeStr(pickFirst(body.textDisplay, query.textDisplay)),
    requestId: safeStr(pickFirst(body.requestId, query.requestId, headers["x-sb-request-id"])).slice(0, 80),
    turnId: safeStr(pickFirst(body.turnId, query.turnId, headers["x-sb-turn-id"])).slice(0, 80),
    sessionId: safeStr(pickFirst(body.sessionId, body.sid, query.sessionId, query.sid, headers["x-sb-session-id"])).slice(0, 120),
    provider: safeStr(pickFirst(body.provider, query.provider, "resemble")),
    routeKind: safeStr(pickFirst(body.routeKind, query.routeKind, body.mode, query.mode, "main")),
    voiceUuid: safeStr(pickFirst(body.voiceUuid, body.voice_uuid, query.voiceUuid, query.voice_uuid, headers["x-sb-voice"])),
    title: safeStr(pickFirst(body.title, query.title, "voice_route")),
    wantJson: wantsJson(req)
  };
}
function classifyFailure(result, attempt) {
  const status = clampInt(result?.providerStatus || result?.status, 0, 0, 999999);
  const retryable = !!result?.retryable;
  const reason = safeStr(result?.reason || "tts_unavailable").toLowerCase();

  if (reason === "missing_text") return { action: "stop", terminal: true, retryable: false, reason };
  if (reason === "missing_voice") return { action: "stop", terminal: true, retryable: false, reason };
  if (reason === "private_network_url_blocked") return { action: "stop", terminal: true, retryable: false, reason };

  if (retryable && attempt < MAX_RETRY_ATTEMPTS && (status === 429 || status === 503 || status === 504 || /timeout|network|circuit|concurrency/.test(reason))) {
    return { action: "retry", terminal: false, retryable: true, reason };
  }
  if (retryable && (status >= 500 || status === 429 || /timeout|network|circuit|concurrency/.test(reason))) {
    return { action: "downgrade", terminal: false, retryable: true, reason };
  }
  if (!retryable && status >= 400 && status < 500) {
    return { action: "stop", terminal: true, retryable: false, reason };
  }
  return { action: "downgrade", terminal: false, retryable: retryable, reason };
}
function buildFailureEnvelope(input, result, decision) {
  return {
    ok: false,
    version: VOICE_ROUTE_VERSION,
    provider: safeStr(result?.provider || input.provider || "resemble"),
    action: safeStr(decision?.action || "downgrade"),
    terminal: !!decision?.terminal,
    retryable: !!decision?.retryable,
    reason: safeStr(decision?.reason || result?.reason || "tts_unavailable"),
    message: safeStr(result?.message || "TTS unavailable."),
    providerStatus: clampInt(result?.providerStatus || result?.status, 0, 0, 999999),
    requestId: safeStr(result?.requestId || input.requestId || ""),
    turnId: safeStr(result?.turnId || input.turnId || ""),
    sessionId: safeStr(result?.sessionId || input.sessionId || ""),
    traceId: safeStr(result?.traceId || ""),
    text: safeStr(result?.text || input.textDisplay || input.text || ""),
    ttsFailure: {
      ok: false,
      action: safeStr(decision?.action || "downgrade"),
      shouldTerminate: !!decision?.terminal,
      retryable: !!decision?.retryable,
      reason: safeStr(decision?.reason || result?.reason || "tts_unavailable"),
      message: safeStr(result?.message || "TTS unavailable."),
      providerStatus: clampInt(result?.providerStatus || result?.status, 0, 0, 999999)
    }
  };
}
async function maybeBuildDowngradedText(input, envelope) {
  if (!chatEngine || typeof chatEngine.handleChat !== "function" || !input.text) {
    return {
      ok: true,
      degraded: true,
      reply: envelope.text || input.text || "Audio is unavailable right now.",
      payload: { reply: envelope.text || input.text || "Audio is unavailable right now." },
      directives: [{ type: "tts_failure", ...envelope.ttsFailure }]
    };
  }
  try {
    return await chatEngine.handleChat({
      text: input.text,
      payload: { ttsFailure: envelope.ttsFailure },
      ctx: { requestId: input.requestId, turnId: input.turnId, sessionId: input.sessionId }
    });
  } catch (_e) {
    return {
      ok: true,
      degraded: true,
      reply: envelope.text || input.text || "Audio is unavailable right now.",
      payload: { reply: envelope.text || input.text || "Audio is unavailable right now." },
      directives: [{ type: "tts_failure", ...envelope.ttsFailure }]
    };
  }
}
async function callDelegate(req, attempt) {
  const payload = { ...(req.body && typeof req.body === "object" ? req.body : {}) };
  payload.requestId = pickFirst(payload.requestId, req.query && req.query.requestId, req.headers && req.headers["x-sb-request-id"]);
  payload.turnId = pickFirst(payload.turnId, req.query && req.query.turnId, req.headers && req.headers["x-sb-turn-id"]);
  payload.sessionId = pickFirst(payload.sessionId, payload.sid, req.query && req.query.sessionId, req.query && req.query.sid, req.headers && req.headers["x-sb-session-id"]);
  payload.__voiceRouteAttempt = attempt;
  return tts.delegateTts(payload, req);
}

async function voiceRoute(req, res) {
  const input = normalizeInput(req);
  setHeaderSafe(res, "X-SB-Voice-Route-Version", VOICE_ROUTE_VERSION);

  let attempt = 0;
  let result = null;
  let decision = null;

  while (attempt <= MAX_RETRY_ATTEMPTS) {
    result = await callDelegate(req, attempt);
    if (result && result.ok) break;
    decision = classifyFailure(result || {}, attempt);
    if (decision.action !== "retry") break;
    attempt += 1;
  }

  if (result && result.ok) {
    setHeaderSafe(res, "X-SB-TTS-Action", "success");
    setHeaderSafe(res, "X-SB-TTS-Provider", safeStr(result.provider || "resemble"));
    setHeaderSafe(res, "X-SB-TTS-Upstream-Status", String(clampInt(result.providerStatus || 200, 200, 0, 999999)));

    if (input.wantJson) {
      return res.status(200).json({
        ok: true,
        version: VOICE_ROUTE_VERSION,
        requestId: safeStr(result.requestId || input.requestId || ""),
        turnId: safeStr(result.turnId || input.turnId || ""),
        sessionId: safeStr(result.sessionId || input.sessionId || ""),
        provider: safeStr(result.provider || "resemble"),
        providerStatus: clampInt(result.providerStatus || 200, 200, 0, 999999),
        mime: safeStr(result.mime || "audio/mpeg"),
        text: safeStr(result.text || input.text || ""),
        routeKind: safeStr(result.routeKind || input.routeKind || "main"),
        audioBase64: Buffer.isBuffer(result.audio) ? result.audio.toString("base64") : ""
      });
    }

    setHeaderSafe(res, "Content-Type", safeStr(result.mime || "audio/mpeg"));
    return res.status(200).send(result.audio);
  }

  decision = decision || classifyFailure(result || {}, attempt);
  const envelope = buildFailureEnvelope(input, result || {}, decision);

  setHeaderSafe(res, "X-SB-TTS-Action", safeStr(envelope.action));
  setHeaderSafe(res, "X-SB-TTS-Reason", safeStr(envelope.reason));
  setHeaderSafe(res, "X-SB-TTS-Upstream-Status", String(clampInt(envelope.providerStatus, 0, 0, 999999)));

  if (envelope.action === "stop") {
    const status = envelope.providerStatus === 0 ? 409 : Math.max(400, Math.min(409, envelope.providerStatus));
    return res.status(status).json(envelope);
  }

  const downgraded = await maybeBuildDowngradedText(input, envelope);
  return res.status(200).json({
    ok: true,
    degraded: true,
    version: VOICE_ROUTE_VERSION,
    action: envelope.action,
    terminal: envelope.terminal,
    ttsFailure: envelope.ttsFailure,
    reply: safeStr((downgraded || {}).reply || envelope.text || input.text || "Audio unavailable."),
    payload: (downgraded || {}).payload || { reply: safeStr((downgraded || {}).reply || envelope.text || input.text || "Audio unavailable.") },
    directives: (downgraded || {}).directives || [Object.assign({ type: "tts_failure" }, envelope.ttsFailure)]
  });

}

module.exports = voiceRoute;
module.exports.voiceRoute = voiceRoute;
module.exports.default = voiceRoute;
module.exports.VOICE_ROUTE_VERSION = VOICE_ROUTE_VERSION;


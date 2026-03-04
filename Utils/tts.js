"use strict";

/**
 * utils/tts.js — Glue module for index.js (external TTS handler)
 *
 * FIXES (this build):
 * - Self-heal loader: if TTS.js wasn't present at boot (or deploy lag), we RETRY loading on request.
 * - Adds diag() so /api/diag/tts can show lastError + lastAttempt + loadedFrom.
 *
 * Expected runtime handler:
 *   project root:  /TTS.js  exporting { handleTts }
 * Fallbacks:
 *   /tts.js
 *
 * ElevenLabs: intentionally NOT referenced here.
 */

function safeStr(v){ return (v==null?"":String(v)); }

const TRIES = [
  "../TTS.js",
  "../tts.js",
  "../TTS",
  "../tts",
];

let _handleTts = null;
let _loadedFrom = "";
let _lastErr = null;
let _lastAttempt = 0;

function tryLoadHandleTts(force){
  const now = Date.now();
  // throttle retries (avoid thrash under load)
  if (!force && (now - _lastAttempt) < 1500) return _handleTts;
  _lastAttempt = now;

  let lastErr = null;
  for (const p of TRIES){
    try{
      // If we previously failed, allow a fresh attempt after deploy
      try{
        const resolved = require.resolve(p);
        if (resolved && require.cache && require.cache[resolved]) delete require.cache[resolved];
      }catch(_){}

      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(p);
      if (mod && typeof mod.handleTts === "function"){
        _handleTts = mod.handleTts;
        _loadedFrom = p;
        _lastErr = null;
        return _handleTts;
      }
    }catch(e){
      lastErr = e;
    }
  }

  _handleTts = null;
  _loadedFrom = "";
  _lastErr = lastErr || new Error("unknown");
  return null;
}

/**
 * Express handler: (req, res) => Promise<void>
 * If handler can't be loaded, respond 503 with a clear JSON error (no secrets).
 */
async function handleTts(req, res){
  // Ensure we always attempt a load (self-heal)
  if (!_handleTts) tryLoadHandleTts(false);

  if (_handleTts) return _handleTts(req, res);

  const traceId =
    (req && req.headers && (req.headers["x-sb-trace-id"] || req.headers["x-sb-traceid"])) ||
    (req && req.headers && req.headers["x-request-id"]) ||
    "";

  const detail = _lastErr ? safeStr(_lastErr.message || _lastErr).slice(0, 240) : "unknown";

  res.status(503).json({
    ok: false,
    error: "TTS_HANDLER_MISSING",
    detail: "utils/tts.js could not load a runtime JS handler. Ensure TTS.js is deployed at project root and exports handleTts.",
    tried: TRIES,
    lastError: detail,
    spokenUnavailable: true,
    meta: {
      traceId: safeStr(traceId).slice(0, 80),
      lastAttempt: _lastAttempt || 0
    }
  });
}

/**
 * Diagnostics for index.js /api/diag/tts
 */
function diag(){
  return {
    ok: true,
    handlerReady: !!_handleTts,
    loadedFrom: _loadedFrom || null,
    tried: TRIES,
    lastAttempt: _lastAttempt || 0,
    lastError: _lastErr ? safeStr(_lastErr.message || _lastErr).slice(0, 400) : null
  };
}

module.exports = { handleTts, diag };

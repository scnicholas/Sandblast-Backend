"use strict";

/**
 * utils/tts.js — Glue module for index.js (external TTS handler)
 *
 * Fixes: TTS_HANDLER_MISSING
 * - index.js tries: require("./utils/tts").handleTts
 * - Previous builds referenced a TS handler (./utils/tts.handler.ts) that isn't present on Render.
 *
 * This module loads the hardened Resemble-only handler from project root TTS.js (or tts.js fallback)
 * and re-exports it as { handleTts }.
 *
 * ElevenLabs: intentionally NOT referenced here.
 */

function safeStr(v){ return (v==null?"":String(v)); }

function loadHandleTts(){
  // Prefer the hardened handler we shipped: /TTS.js
  const tries = [
    "../TTS.js",
    "../tts.js",
    "../TTS",
    "../tts",
  ];

  let lastErr = null;
  for (const p of tries){
    try{
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(p);
      if (mod && typeof mod.handleTts === "function") return mod.handleTts;
    }catch(e){ lastErr = e; }
  }

  // If we reach here, we couldn't load a handler.
  const detail = lastErr ? safeStr(lastErr.message || lastErr).slice(0, 240) : "unknown";
  const err = new Error(`TTS handler loader failed. Tried: ${tries.join(", ")}. Last: ${detail}`);
  err.code = "TTS_HANDLER_MISSING";
  throw err;
}

let _handleTts = null;
try{
  _handleTts = loadHandleTts();
}catch(_){ _handleTts = null; }

/**
 * Express handler: (req, res) => Promise<void>
 * If handler can't be loaded, respond 503 with a clear JSON error (no secrets).
 */
async function handleTts(req, res){
  if (_handleTts) return _handleTts(req, res);

  const traceId =
    (req && req.headers && (req.headers["x-sb-trace-id"] || req.headers["x-sb-traceid"])) ||
    (req && req.headers && req.headers["x-request-id"]) ||
    "";

  res.status(503).json({
    ok: false,
    error: "TTS_HANDLER_MISSING",
    detail: "utils/tts.js could not load a runtime JS handler. Ensure TTS.js is deployed and exports handleTts.",
    spokenUnavailable: true, // keep UX compatible (flag exists)
    meta: { traceId: safeStr(traceId).slice(0, 80) }
  });
}

module.exports = { handleTts };

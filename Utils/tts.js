"use strict";

/**
 * utils/tts.js — Canonical glue for index.js (Resemble-only)
 *
 * Goals:
 * - Eliminate "TTS_HANDLER_MISSING" by providing a stable, JS-only export surface.
 * - Avoid provider drift (NO ElevenLabs references; Resemble is the only allowed vendor).
 * - Add operational-intelligence diagnostics and safer failure modes (never crash the server).
 *
 * Exports:
 *   { handleTts, diagTts }
 *
 * Expected in index.js:
 *   const { handleTts, diagTts } = require("./utils/tts");
 *   app.post("/api/tts", handleTts);
 *   app.get("/api/diag/tts", requireWidgetToken, diagTts); // recommended
 */

function s(v){ return (v==null) ? "" : String(v); }
function b(v, def=false){
  const x = s(v).trim().toLowerCase();
  if(!x) return def;
  return (x==="1"||x==="true"||x==="yes"||x==="y"||x==="on");
}

function mkTraceId(){
  try{
    const crypto = require("crypto");
    return crypto.randomBytes(12).toString("base64")
      .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }catch(_){
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }
}

function safeJson(res, status, obj){
  try{
    res.status(status);
    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.setHeader("Cache-Control","no-store");
    res.end(JSON.stringify(obj));
  }catch(_){
    try{ res.end(); }catch(__){}
  }
}

/** Provider policy: hard stop anything except Resemble. */
function ensureResembleOnly(){
  const p = (s(process.env.TTS_PROVIDER || process.env.SB_TTS_PROVIDER || "resemble").trim().toLowerCase());
  if(p && p !== "resemble"){
    const e = new Error(`Provider '${p}' is forbidden (Resemble-only build). Set TTS_PROVIDER=resemble.`);
    e.code = "PROVIDER_FORBIDDEN";
    throw e;
  }
}

/**
 * Loader strategy (in priority order):
 *  1) New canonical layout: ./tts/handler exports { handleTts } (recommended)
 *  2) Legacy hardened handler in project root: ../TTS.js exports { handleTts }
 *  3) Legacy fallback in project root: ../tts.js exports { handleTts }
 *
 * Why: Render deploys JS; TS paths are brittle. We only load JS modules.
 */
function loadRuntime(){
  ensureResembleOnly();

  const tries = [
    "./tts/handler.js",
    "./tts/handler",
    "../TTS.js",
    "../TTS",
    "../tts.js",
    "../tts",
  ];

  let lastErr = null;
  for(const p of tries){
    try{
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(p);
      const fn = mod && (mod.handleTts || mod.default);
      if(typeof fn === "function"){
        return { ok:true, path:p, handleTts: fn, mod };
      }
    }catch(e){
      lastErr = e;
    }
  }

  const detail = lastErr ? s(lastErr.message || lastErr).slice(0, 240) : "unknown";
  const err = new Error(`TTS handler loader failed. Tried: ${tries.join(", ")}. Last: ${detail}`);
  err.code = "TTS_HANDLER_MISSING";
  err.detail = detail;
  err.tries = tries;
  throw err;
}

let RUNTIME = { ok:false, path:"", handleTts:null, mod:null, err:null };
try{
  RUNTIME = loadRuntime();
}catch(e){
  RUNTIME = { ok:false, path:"", handleTts:null, mod:null, err:e };
}

function getEnvFlags(){
  return {
    TTS_PROVIDER: !!(process.env.TTS_PROVIDER || process.env.SB_TTS_PROVIDER),
    RESEMBLE_API_KEY: !!(process.env.RESEMBLE_API_KEY || process.env.RESEMBLE_API_TOKEN),
    RESEMBLE_PROJECT_UUID: !!process.env.RESEMBLE_PROJECT_UUID,
    RESEMBLE_VOICE_UUID: !!(process.env.RESEMBLE_VOICE_UUID || process.env.SBNYX_RESEMBLE_VOICE_UUID || process.env.SB_RESEMBLE_VOICE_UUID),
    SOVEREIGN_MODE: b(process.env.TTS_SOVEREIGN_MODE, true),
  };
}

function setDiagHeaders(res, traceId){
  try{
    res.setHeader("Cache-Control","no-store");
    res.setHeader("X-SB-TTS-Glue","utils/tts.js");
    res.setHeader("X-SB-TTS-TraceId", s(traceId));
    res.setHeader("X-SB-TTS-Loaded", RUNTIME.ok ? "1" : "0");
    res.setHeader("X-SB-TTS-HandlerPath", s(RUNTIME.path));
    res.setHeader("X-SB-TTS-Provider","resemble");
  }catch(_){}
}

/**
 * Express handler: POST /api/tts
 * Never throws uncaught. If runtime handler is missing, returns a UX-compatible 503 JSON.
 */
async function handleTts(req, res){
  const traceId =
    s(req && req.headers && (req.headers["x-sb-trace-id"] || req.headers["x-sb-traceid"] || req.headers["x-request-id"])) ||
    mkTraceId();

  // Defensive: do not let the glue layer crash the server.
  try{
    // If runtime wasn't loaded at startup, try again (helps after hot deploy or partial boot).
    if(!RUNTIME.ok || typeof RUNTIME.handleTts !== "function"){
      try{ RUNTIME = loadRuntime(); }catch(e){ RUNTIME = { ok:false, path:"", handleTts:null, mod:null, err:e }; }
    }

    if(RUNTIME.ok && typeof RUNTIME.handleTts === "function"){
      setDiagHeaders(res, traceId);
      // Marion/Operational-Intel hook: correlated tracing
      req.__sbTraceId = traceId;
      return await RUNTIME.handleTts(req, res);
    }

    setDiagHeaders(res, traceId);
    const err = RUNTIME.err || { code:"TTS_HANDLER_MISSING" };
    return safeJson(res, 503, {
      ok:false,
      error: "TTS_HANDLER_MISSING",
      detail: "utils/tts.js could not load a runtime JS handler. Ensure canonical handler exists and exports handleTts.",
      spokenUnavailable: true,
      traceId,
      meta: {
        code: s(err.code || "TTS_HANDLER_MISSING"),
        last: s(err.detail || err.message || "").slice(0, 240),
        tried: (err.tries && Array.isArray(err.tries)) ? err.tries.slice(0, 8) : []
      }
    });
  }catch(e){
    setDiagHeaders(res, traceId);
    return safeJson(res, 503, {
      ok:false,
      error:"TTS_GLUE_FAILED",
      spokenUnavailable:true,
      traceId,
      detail: s(e && e.message || e).slice(0, 240)
    });
  }
}

/**
 * Express handler: GET /api/diag/tts
 * Safe diagnostics (no secrets).
 */
function diagTts(req, res){
  const traceId =
    s(req && req.headers && (req.headers["x-sb-trace-id"] || req.headers["x-sb-traceid"] || req.headers["x-request-id"])) ||
    mkTraceId();

  setDiagHeaders(res, traceId);

  const err = RUNTIME.err || null;
  return safeJson(res, 200, {
    ok:true,
    providerPolicy: "resemble_only",
    loaded: !!RUNTIME.ok,
    handlerPath: s(RUNTIME.path),
    envFlags: getEnvFlags(),
    error: err ? { code: s(err.code || "ERR"), detail: s(err.detail || err.message || "").slice(0, 240) } : null,
    now: new Date().toISOString(),
    meta: {
      traceId,
      glue: "utils/tts.js v2.1 (OPINTEL: diag + reload + resemble-only + safe failures)"
    }
  });
}

module.exports = { handleTts, diagTts };

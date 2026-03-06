"use strict";

/**
 * s2s.js — Hardened Nyx <-> Marion bridge
 *
 * PURPOSE
 * - Normalizes inbound chat requests from API routes / widget / internal callers.
 * - Calls chatEngine without altering its structure.
 * - Surfaces a stable contract for reply, TTS, text-to-synth, and when audio should play.
 * - Adds light operational-intelligence bridge metadata so Marion and Nyx stay aligned.
 *
 * EXPORTS
 * - runLocalChat(promptOrInput, context?)
 * - handleChatRoute(req, res)
 * - health()
 * - handleTts passthrough when available
 */

const crypto = require("crypto");

let ChatEngine = null;
try { ChatEngine = require("./chatEngine"); } catch (_) {
  try { ChatEngine = require("./Utils/chatEngine"); } catch (_e) { ChatEngine = null; }
}

let TTS = null;
try { TTS = require("./tts"); } catch (_) {
  try { TTS = require("./TTS"); } catch (_e) { TTS = null; }
}

function _str(v){ return v == null ? "" : String(v); }
function _trim(v){ return _str(v).trim(); }
function _isObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }
function _clampInt(v, dflt, min, max){
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function _safeJson(x){
  try { return JSON.stringify(x); } catch (_) { return "{}"; }
}
function _traceId(){
  try { return crypto.randomBytes(8).toString("hex"); } catch (_) { return String(Date.now()); }
}
function _sha1Lite(str){
  const s = _str(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function _bool(v, dflt){
  if (v === undefined || v === null || v === "") return !!dflt;
  const s = _trim(v).toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return !!dflt;
}
function _softSpeak(text){
  let t = _trim(text || "");
  if (!t) return "";
  t = t.replace(/\bI'm\b/g, "I am")
       .replace(/\bcan't\b/gi, "cannot")
       .replace(/\bwon't\b/gi, "will not")
       .replace(/\bit's\b/gi, "it is")
       .replace(/\bthat's\b/gi, "that is")
       .replace(/\bthere's\b/gi, "there is");
  t = t.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
function _asArr(v){ return Array.isArray(v) ? v : []; }

function createChatPayload(promptOrInput, context){
  if (_isObj(promptOrInput)) {
    const input = { ...promptOrInput };
    const ctx = _isObj(input.ctx) ? { ...input.ctx } : (_isObj(input.context) ? { ...input.context } : {});
    const body = _isObj(input.body) ? { ...input.body } : {};
    const session = _isObj(input.session) ? { ...input.session } : (_isObj(body.session) ? { ...body.session } : {});

    if (!input.requestId) input.requestId = _trim(body.requestId) || _traceId();
    if (!input.text) input.text = _trim(input.prompt) || _trim(body.prompt) || _trim(body.text) || "";
    if (!input.prompt) input.prompt = input.text;
    if (!input.ctx) input.ctx = ctx;
    if (!input.body) input.body = body;
    if (!input.body.prompt) input.body.prompt = input.text;
    if (!input.body.text) input.body.text = input.text;
    if (!input.body.ctx) input.body.ctx = input.ctx;
    if (!input.body.session) input.body.session = session;
    if (!input.session) input.session = session;
    if (!input.body.requestId) input.body.requestId = input.requestId;
    return input;
  }

  const prompt = _trim(promptOrInput);
  const ctx = _isObj(context) ? { ...context } : {};
  const session = _isObj(ctx.session) ? { ...ctx.session } : {};

  return {
    text: prompt,
    prompt,
    ctx,
    body: {
      prompt,
      text: prompt,
      ctx,
      session,
    },
    session,
    requestId: _traceId(),
  };
}

function extractAudioPlan(out, input){
  const directives = _asArr(out && out.directives);
  const ttsDir = directives.find((d) => _isObj(d) && _trim(d.type).toUpperCase() === "TTS_SPEAK") || null;
  const playDir = directives.find((d) => _isObj(d) && _trim(d.type).toUpperCase() === "AUDIO_PLAY") || null;
  const reply = _trim(out && (out.reply || (out.payload && out.payload.reply) || ""));
  const ctx = _isObj(out && out.ctx) ? out.ctx : (_isObj(input && input.ctx) ? input.ctx : {});
  const shouldSpeak = !!(ttsDir && _trim(ttsDir.text || ttsDir.textToSynth || reply));
  const textToSynth = _softSpeak(_trim(ttsDir && (ttsDir.textToSynth || ttsDir.text) ? (ttsDir.textToSynth || ttsDir.text) : reply)).slice(0, 2200);
  const autoPlay = shouldSpeak && (playDir ? _bool(playDir.autoPlay, true) : _bool(ctx.autoPlayAudio, true));

  return {
    enabled: shouldSpeak,
    provider: _trim((ttsDir && ttsDir.provider) || process.env.TTS_PROVIDER || "resemble") || "resemble",
    voiceMode: _trim(ttsDir && ttsDir.voiceMode) || "nyx_primary",
    textToSynth,
    chars: textToSynth.length,
    autoPlay,
    when: _trim((playDir && playDir.when) || (ttsDir && ttsDir.when) || "post_reply") || "post_reply",
    strategy: _trim((playDir && playDir.strategy) || "single_shot") || "single_shot",
  };
}

function applyBridgeRefinements(out, input){
  const base = _isObj(out) ? { ...out } : {};
  base.bridge = _isObj(base.bridge) ? { ...base.bridge } : {};
  base.meta = _isObj(base.meta) ? { ...base.meta } : {};
  base.sessionPatch = _isObj(base.sessionPatch) ? { ...base.sessionPatch } : {};
  base.directives = _asArr(base.directives).slice();
  base.followUps = _asArr(base.followUps).slice();
  base.followUpsStrings = _asArr(base.followUpsStrings).slice();

  const audioPlan = extractAudioPlan(base, input);
  const reply = _trim(base.reply || (base.payload && base.payload.reply) || "");
  const routeHash = _sha1Lite(_safeJson({ lane: base.lane || "general", intent: base.cog && base.cog.intent, reply: reply.slice(0, 220) })).slice(0, 12);

  base.bridge = {
    ...base.bridge,
    routeHash,
    opIntel: true,
    bridgeState: "marion_nyx_aligned",
    tts: {
      enabled: audioPlan.enabled,
      autoPlay: audioPlan.autoPlay,
      provider: audioPlan.provider,
      textToSynth: audioPlan.textToSynth,
      when: audioPlan.when,
      strategy: audioPlan.strategy,
    },
  };

  base.meta.s2s = {
    v: "s2s v1.0.0 OPINTEL",
    routeHash,
    audio: {
      enabled: audioPlan.enabled,
      autoPlay: audioPlan.autoPlay,
      chars: audioPlan.chars,
    },
    phases: {
      bridge: 15,
      governor: true,
      textToSynth: true,
    },
  };

  base.sessionPatch.__s2sTraceId = _trim(input && input.requestId) || _traceId();
  base.sessionPatch.__bridgeAlignedAt = Date.now();
  base.sessionPatch.__lastAudioPlan = {
    enabled: audioPlan.enabled,
    autoPlay: audioPlan.autoPlay,
    chars: audioPlan.chars,
    provider: audioPlan.provider,
  };

  if (audioPlan.enabled && !directivesHas(base.directives, "TTS_SPEAK")) {
    base.directives.push({
      type: "TTS_SPEAK",
      text: audioPlan.textToSynth,
      textToSynth: audioPlan.textToSynth,
      provider: audioPlan.provider,
      voiceMode: audioPlan.voiceMode,
      autoPlay: audioPlan.autoPlay,
      when: audioPlan.when,
    });
  }
  if (audioPlan.enabled && audioPlan.autoPlay && !directivesHas(base.directives, "AUDIO_PLAY")) {
    base.directives.push({
      type: "AUDIO_PLAY",
      autoPlay: true,
      when: audioPlan.when,
      strategy: audioPlan.strategy,
      allowDuplicate: false,
    });
  }

  if (!base.audio) base.audio = audioPlan;
  if (!base.payload && reply) base.payload = { reply };
  return base;
}

function directivesHas(arr, type){
  return _asArr(arr).some((d) => _isObj(d) && _trim(d.type).toUpperCase() === _trim(type).toUpperCase());
}

async function runLocalChat(promptOrInput, context){
  const input = createChatPayload(promptOrInput, context);
  const started = Date.now();

  if (!ChatEngine) {
    return {
      ok: false,
      reply: "Chat engine is unavailable.",
      lane: "general",
      directives: [],
      followUps: [],
      followUpsStrings: [],
      sessionPatch: {},
      bridge: { opIntel: false, error: "CHATENGINE_MISSING" },
      meta: { elapsedMs: Date.now() - started, s2s: { v: "s2s v1.0.0 OPINTEL", error: "CHATENGINE_MISSING" } },
      requestId: input.requestId,
    };
  }

  const fn = typeof ChatEngine.handleChat === "function"
    ? ChatEngine.handleChat
    : (typeof ChatEngine.chatEngine === "function" ? ChatEngine.chatEngine : (typeof ChatEngine === "function" ? ChatEngine : null));

  if (!fn) {
    return {
      ok: false,
      reply: "Chat engine entrypoint is invalid.",
      lane: "general",
      directives: [],
      followUps: [],
      followUpsStrings: [],
      sessionPatch: {},
      bridge: { opIntel: false, error: "CHATENGINE_INVALID" },
      meta: { elapsedMs: Date.now() - started, s2s: { v: "s2s v1.0.0 OPINTEL", error: "CHATENGINE_INVALID" } },
      requestId: input.requestId,
    };
  }

  try {
    const out = await fn(input);
    const refined = applyBridgeRefinements(out, input);
    refined.requestId = _trim(refined.requestId) || input.requestId;
    refined.meta.elapsedMs = _clampInt(Date.now() - started, 0, 0, 600000);
    return refined;
  } catch (e) {
    const detail = _trim(e && e.message ? e.message : e).slice(0, 300);
    return {
      ok: false,
      reply: "Backend is stabilizing. Try again in a moment.",
      lane: "general",
      directives: [],
      followUps: [],
      followUpsStrings: [],
      sessionPatch: { __s2sErrorAt: Date.now() },
      bridge: { opIntel: false, error: "S2S_RUN_FAILED" },
      meta: { elapsedMs: Date.now() - started, error: detail, s2s: { v: "s2s v1.0.0 OPINTEL", error: "S2S_RUN_FAILED" } },
      requestId: input.requestId,
    };
  }
}

async function handleChatRoute(req, res){
  const body = _isObj(req && req.body) ? req.body : {};
  const input = createChatPayload({
    ...body,
    body,
    ctx: _isObj(body.context) ? body.context : (_isObj(body.ctx) ? body.ctx : {}),
    session: _isObj(body.session) ? body.session : {},
    requestId: _trim((req && req.headers && (req.headers["x-sb-trace"] || req.headers["x-sb-trace-id"])) || body.requestId) || _traceId(),
  });

  try {
    const out = await runLocalChat(input);
    if (res && typeof res.setHeader === "function") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-SB-TraceId", out.requestId || input.requestId);
      res.setHeader("X-SB-Bridge", "marion-nyx");
    }
    return res.status(200).json({ ok: true, out });
  } catch (e) {
    const detail = _trim(e && e.message ? e.message : e).slice(0, 300);
    if (res && typeof res.setHeader === "function") {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-SB-TraceId", input.requestId);
    }
    return res.status(500).json({ ok: false, error: "chat_failed", detail, requestId: input.requestId });
  }
}

function health(){
  return {
    ok: true,
    time: new Date().toISOString(),
    ttsProvider: _trim(process.env.TTS_PROVIDER || "resemble") || "resemble",
    resembleVoice: !!(_trim(process.env.RESEMBLE_VOICE_UUID) || _trim(process.env.RESEMBLE_VOICE_ID)),
    modules: {
      chatEngine: !!ChatEngine,
      tts: !!TTS,
    },
  };
}

module.exports = {
  runLocalChat,
  createChatPayload,
  handleChatRoute,
  health,
  handleTts: TTS && typeof TTS.handleTts === "function" ? TTS.handleTts : undefined,
};

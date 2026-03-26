"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v2.12.2sb TTS-HARDENED-AUDIO-CONTRACT + NEWSCANADA-MOUNT-FIX
 * ------------------------------------------------------------
 * PURPOSE
 * - Tightened backend shell
 * - Removes duplicate replay authority from index layer
 * - Keeps Chat Engine as the semantic turn authority
 * - Uses TTS as the single synthesis authority
 * - Preserves frontend voice route contract without provider-side dispatch authority
 * - Keeps fail-open rendering contract
 * - Hardens TTS route error handling and response finalization
 * - Adds affect/stabilize/fail-safe unification
 * - Adds loop suppression / stale-UI wipe discipline
 * - Adds TTS response normalization so playable audio always streams when available
 * - Strengthens News Canada file mount / hydration into app.locals
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const createNewsCanadaRuntime = require("./runtime/newsCanadaRuntime");

let compression = null;
try {
  compression = require("compression");
} catch (_) {
  compression = null;
}

const INDEX_VERSION = "index.js v2.13.0sb COMMERCIAL-HARDENED + NEWSCANADA-RUNTIME-SPLIT";
const SERVER_BOOT_AT = Date.now();

process.on("unhandledRejection", (reason) => {
  console.log("[Sandblast][unhandledRejection]", reason && (reason.stack || reason.message || reason));
});

process.on("uncaughtException", (err) => {
  console.log("[Sandblast][uncaughtException]", err && (err.stack || err.message || err));
  try {
    if (err && String(err.message || "").includes("EADDRINUSE")) process.exit(1);
  } catch (_) {}
});

function tryRequireMany(paths) {
  for (const p of paths) {
    try {
      const mod = require(p);
      if (mod) return mod;
    } catch (_) {}
  }
  return null;
}

function moduleAvailable(name) {
  try {
    require.resolve(name);
    return true;
  } catch (_) {
    return false;
  }
}

const envLoader = tryRequireMany(["dotenv", "./node_modules/dotenv"]);
if (envLoader && typeof envLoader.config === "function") {
  try { envLoader.config(); } catch (_) {}
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

if (compression) {
  app.use(compression());
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const newsCanadaRuntime = createNewsCanadaRuntime({
  app,
  fs,
  path,
  baseDir: __dirname,
  cwd: process.cwd(),
  indexVersion: INDEX_VERSION,
  refreshMs: Number(process.env.NEWS_CANADA_REFRESH_MS || 60000)
});
newsCanadaRuntime.initLocals();
const NEWS_CANADA_CONTRACT_VERSION = newsCanadaRuntime.contractVersion;

function bootstrapNewsCanadaFeed() {
  return newsCanadaRuntime.bootstrap();
}

function wantsNewsCanadaLegacyArray(req) {
  return newsCanadaRuntime.wantsLegacyArray(req);
}

function buildNewsCanadaEditorsPicksResponse(req) {
  return newsCanadaRuntime.buildEditorsPicksResponse(req);
}

function buildNewsCanadaStoryResponse(req) {
  return newsCanadaRuntime.buildStoryResponse(req);
}

function loadNewsCanadaEditorsPicksFromDisk() {
  return newsCanadaRuntime.loadFromDisk();
}

function resolveNewsCanadaDataFile() {
  return newsCanadaRuntime.resolveDataFile();
}

function normalizeNewsCanadaFeed(payload) {
  return newsCanadaRuntime.normalizeFeed(payload);
}

function hydrateNewsCanadaLocals(parsed, file) {
  return newsCanadaRuntime.hydrateLocals(parsed, file);
}

app.get(["/api/newscanada/editors-picks", "/newscanada/editors-picks"], (req, res) => {
  applyCors(req, res);
  const out = buildNewsCanadaEditorsPicksResponse(req);
  if (wantsNewsCanadaLegacyArray(req)) {
    res.setHeader("x-sb-newscanada-shape", "array");
    return res.status(200).json(out.slides || out.stories || []);
  }
  res.setHeader("x-sb-newscanada-shape", "object");
  return res.status(200).json(out);
});

app.get(["/api/newscanada/editors-picks/meta", "/newscanada/editors-picks/meta"], (req, res) => {
  applyCors(req, res);
  res.setHeader("x-sb-newscanada-shape", "object");
  return res.status(200).json(buildNewsCanadaEditorsPicksResponse(req));
});

app.get(["/api/newscanada/story", "/newscanada/story"], (req, res) => {
  applyCors(req, res);
  const out = buildNewsCanadaStoryResponse(req);
  return res.status(out.ok ? 200 : 404).json(out);
});


app.get("/health", (req, res) => {
  applyCors(req, res);
  const ttsHealth = ttsHealthFromModule(ttsMod);
  let tts = null;
  try { tts = ttsHealth ? ttsHealth() : null; } catch (_) {}
  return res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    upMs: now() - SERVER_BOOT_AT,
    bootAt: SERVER_BOOT_AT,
    modules: {
      chatEngine: !!chatEngineMod,
      marionBridge: !!marionBridgeMod,
      supportResponse: !!supportResponseMod,
      affectEngine: !!affectEngineMod,
      voiceRoute: !!voiceRouteMod,
      tts: !!ttsMod
    },
    runtimeDeps: {
      express: moduleAvailable("express"),
      compression: moduleAvailable("compression"),
      dotenv: moduleAvailable("dotenv")
    },
    bindings: {
      voiceRouteHandler: false,
      voiceRouteHealth: false,
      ttsHandler: !!ttsHandlerFromModule(ttsMod),
      ttsHealth: !!ttsHealthFromModule(ttsMod)
    },
    voiceRouteEnabled: !!CFG.voiceRouteEnabled,
    preserveMixerVoice: !!CFG.preserveMixerVoice,
    tts
  });
});

app.get("/api/health", (req, res) => {
  applyCors(req, res);
  const ttsHealth = ttsHealthFromModule(ttsMod);
  let tts = null;
  try { tts = ttsHealth ? ttsHealth() : null; } catch (_) {}
  return res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("health")),
    upMs: now() - SERVER_BOOT_AT,
    tts,
    voiceRouteEnabled: !!CFG.voiceRouteEnabled,
    requireVoiceRouteToken: !!CFG.requireVoiceRouteToken,
    backendPublicBase: getBackendPublicBase(),
    audioContract: {
      version: "audio-first-v1",
      endpoint: routeUrl("/api/tts"),
      healthEndpoint: routeUrl("/api/tts/health"),
      deterministicAudio: true
    },
    newsCanada: {
      contractVersion: NEWS_CANADA_CONTRACT_VERSION,
      file: app.locals.newsCanadaEditorsPicksMeta?.file || resolveNewsCanadaDataFile(),
      availableStories: Array.isArray(app.locals.newsCanadaEditorsPicks) ? app.locals.newsCanadaEditorsPicks.length : 0,
      loadedAt: app.locals.newsCanadaEditorsPicksMeta?.loadedAt || 0,
      degraded: !!app.locals.newsCanadaEditorsPicksMeta?.degraded,
      source: app.locals.newsCanadaEditorsPicksMeta?.source || "bootstrap",
      sourceShape: app.locals.newsCanadaEditorsPicksMeta?.sourceShape || "",
      rawKeys: app.locals.newsCanadaEditorsPicksMeta?.rawKeys || [],
      stableRoutes: {
        editorsPicks: "/api/newscanada/editors-picks",
        editorsPicksMeta: "/api/newscanada/editors-picks/meta",
        story: "/api/newscanada/story"
      }
    }
  });
});

app.get("/api/tts/health", enforceVoiceRouteAccess, async (req, res) => {
  applyCors(req, res);
  const handler = ttsHealthFromModule(ttsMod);
  if (!handler) {
    return res.status(200).json({
      ok: false,
      enabled: false,
      error: "tts_health_unavailable",
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: INDEX_VERSION, t: now() }
    });
  }
  try {
    const health = await Promise.resolve(handler());
    return res.status(200).json({
      ok: !!(health && health.ok !== false),
      enabled: true,
      health,
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: INDEX_VERSION, t: now() }
    });
  } catch (err) {
    return res.status(503).json({
      ok: false,
      enabled: true,
      error: "tts_health_failed",
      detail: cleanText(err && (err.message || err) || "tts health failed"),
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: INDEX_VERSION, t: now() }
    });
  }
});

app.post(["/api/tts", "/tts"], enforceVoiceRouteAccess, async (req, res) => {
  applyCors(req, res);
  try {
    return await dispatchTts(req, res);
  } catch (err) {
    console.log("[Sandblast][ttsRoute:error]", err && (err.stack || err.message || err));
    if (res.headersSent) return;
    return sendTtsJsonError(req, res, 503, "tts_route_failure", cleanText(err && (err.message || err) || "tts route failed"), {
      configSource: ttsHandlerFromModule(ttsMod) ? "tts_module" : "unavailable",
      ttsModuleBound: !!ttsHandlerFromModule(ttsMod)
    });
  }
});

app.post("/api/chat", enforceToken, async (req, res) => {
  applyCors(req, res);
  const startedAt = now();
  const norm = normalizePayload(req);
  const sessionId = getSessionId(req);
  const priorSupport = getSupportState(sessionId);
  let supportHold = clamp(Number(priorSupport.hold || 0), 0, CFG.quietSupportHoldTurns);
  let supportActive = !!priorSupport.active && supportHold > 0;
  if (supportHold > 0) supportHold -= 1;
  let failSafe = false;

  const emotion = inferEmotion(norm.text, {
    lane: norm.lane,
    mode: norm.mode,
    sessionId,
    traceId: norm.traceId
  });

  const transportKey = buildTransportKey(norm, norm.text, req);
  const transportState = getTransportState(sessionId);
  if (transportKey && transportState.key === transportKey && (startedAt - Number(transportState.at || 0) < CFG.loopSuppressionWindowMs)) {
    setTransportState(sessionId, { key: transportKey, count: Number(transportState.count || 0) + 1 });
    return res.status(200).json({
      ok: true,
      reply: normalizeSupportReply("I am here with you. We can take this one step at a time."),
      payload: { reply: normalizeSupportReply("I am here with you. We can take this one step at a time.") },
      lane: norm.lane || "general",
      laneId: norm.lane || "general",
      sessionLane: norm.lane || "general",
      bridge: null,
      ctx: {},
      ui: buildQuietUiPatch("loop", true).ui,
      directives: [],
      followUps: [],
      followUpsStrings: [],
      sessionPatch: buildSupportSessionPatch({}, true, false),
      cog: { intent: "STABILIZE", mode: "transitional", publicMode: true },
      requestId: makeTraceId("req"),
      traceId: norm.traceId,
      meta: {
        v: INDEX_VERSION,
        t: now(),
        transportDuplicateSuppressed: true,
        supportHold: Math.max(supportHold, 1),
        latencyMs: now() - startedAt
      },
      voiceRoute: normalizeVoiceRouteResponse(attachVoiceRoute({ reply: norm.text || "" }).voiceRoute)
    });
  }
  setTransportState(sessionId, { key: transportKey, count: 1 });

  const marionInput = {
    text: norm.text,
    lane: norm.lane,
    year: norm.year,
    mode: norm.mode,
    traceId: norm.traceId,
    sessionId,
    turnId: norm.turnId,
    payload: norm.payload,
    emotion,
    guidedPrompt: norm.guidedPrompt,
    domainHint: norm.domainHint,
    intentHint: norm.intentHint,
    emotionalHint: norm.emotionalHint
  };

  let marion = null;
  try {
    marion = await callWithTimeout(callMarionBridge(marionInput), CFG.requestTimeoutMs, "marion_bridge");
  } catch (err) {
    console.log("[Sandblast][marionBridge:timeout]", err && (err.stack || err.message || err));
    marion = null;
  }

  const engineInput = {
    text: norm.text,
    payload: norm.payload,
    body: norm.body,
    lane: norm.lane,
    year: norm.year,
    mode: norm.mode,
    turnId: norm.turnId,
    traceId: norm.traceId,
    sessionId,
    client: norm.client,
    marion,
    emotion,
    guidedPrompt: norm.guidedPrompt,
    domainHint: norm.domainHint,
    intentHint: norm.intentHint,
    emotionalHint: norm.emotionalHint,
    knowledge: knowledgeRuntime.extract(norm.text, { marion, guidedPrompt: norm.guidedPrompt })
  };

  let engineRaw = null;
  let engineError = null;
  try {
    engineRaw = await callWithTimeout(callChatEngine(engineInput), CFG.requestTimeoutMs, "chat_engine");
    if (engineRaw && engineRaw.__engineError) {
      engineError = engineRaw.__engineError;
      engineRaw = null;
    }
  } catch (err) {
    engineError = err;
  }

  let shaped = shapeEngineReply(engineRaw);
  if (!shaped.lane) shaped.lane = norm.lane || "general";
  if (!shaped.laneId) shaped.laneId = shaped.lane;
  if (!shaped.sessionLane) shaped.sessionLane = shaped.lane;
  if (!shaped.bridge && marion) shaped.bridge = marion;
  shaped = applyAffectBridge(shaped, buildAffectInputFromMarion(marion));

  if (shouldEnterSupportHold(norm.text, emotion, shaped.cog || shaped.meta || {})) {
    supportActive = true;
    supportHold = Math.max(supportHold, CFG.quietSupportHoldTurns);
  }

  if (engineError) {
    failSafe = true;
    const supportReply = buildSafeSupportReply(norm.text, emotion, {
      traceId: norm.traceId,
      sessionId,
      source: "engine_error"
    });

    shaped = {
      ok: false,
      reply: supportReply,
      payload: { reply: supportReply },
      lane: norm.lane || "general",
      laneId: norm.lane || "general",
      sessionLane: norm.lane || "general",
      bridge: marion || null,
      ctx: {},
      ui: {},
      directives: [],
      followUps: [],
      followUpsStrings: [],
      sessionPatch: {},
      cog: { intent: "STABILIZE", mode: "transitional", publicMode: true },
      meta: {
        v: INDEX_VERSION,
        t: now(),
        engineVersion: "chatEngine failure contained",
        knowledge: knowledgeRuntime.extract(norm.text, { marion }),
        clearStaleUi: true,
        suppressMenus: true,
        failSafe: true,
        error: cleanText(engineError && engineError.message || engineError || "engine failure")
      }
    };
  }

  let reply = cleanText(shaped.reply || shaped.payload?.reply || "");
  if (!reply) {
    reply = buildSafeSupportReply(norm.text, emotion, {
      traceId: norm.traceId,
      sessionId,
      source: "empty_reply"
    });
    shaped.reply = reply;
    shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply };
    supportActive = true;
    supportHold = Math.max(supportHold, CFG.quietSupportHoldTurns);
  }

  reply = cleanReplyForUser(reply);
  shaped.reply = reply;
  shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply };

  const loop = detectLoop(sessionId, reply, norm.text);
  if (loop.repeated) {
    failSafe = false;
    supportActive = true;
    supportHold = Math.max(supportHold, 1);
    reply = normalizeSupportReply("I am here with you. We can take this one step at a time.");
    shaped.reply = reply;
    shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply };
    shaped.cog = {
      ...(isObj(shaped.cog) ? shaped.cog : {}),
      intent: "STABILIZE",
      mode: "transitional",
      publicMode: true
    };
    shaped.meta = mergeMeta(shaped.meta, {
      duplicateReplySuppressed: true
    });
  }

  const suppressMenus = shouldSuppressMenus(shaped, supportActive || failSafe);
  if (suppressMenus) {
    supportActive = true;
    supportHold = Math.max(supportHold, 1);
  }

  setSupportState(sessionId, {
    active: supportActive,
    hold: supportHold,
    replyHash: replyHash(reply),
    lastUserHash: replyHash(norm.text)
  });

  const sessionPatch = buildSupportSessionPatch(shaped.sessionPatch, supportActive, !supportActive);
  shaped.sessionPatch = sessionPatch;

  shaped.meta = mergeMeta(shaped.meta, {
    v: INDEX_VERSION,
    t: now(),
    knowledge: shaped.meta?.knowledge || knowledgeRuntime.extract(norm.text, { marion }),
    clearStaleUi: suppressMenus,
    suppressMenus,
    failSafe: !!failSafe,
    error: shaped.meta?.error || "",
    indexLoopGuard: true,
    supportHold,
    traceId: norm.traceId,
    latencyMs: now() - startedAt
  });

  shaped.cog = {
    ...(isObj(shaped.cog) ? shaped.cog : {}),
    intent: shaped.cog?.intent || (supportActive ? "STABILIZE" : ""),
    mode: shaped.cog?.mode || (supportActive ? "transitional" : ""),
    publicMode: shaped.cog?.publicMode !== false
  };

  shaped = attachVoiceRoute(shaped);
  const speech = buildSpeechContract(shaped, norm);
  shaped.payload = {
    ...(isObj(shaped.payload) ? shaped.payload : {}),
    text: speech.text,
    textDisplay: speech.textDisplay,
    textSpeak: speech.textSpeak,
    routeKind: speech.routeKind,
    intro: speech.intro,
    source: speech.source,
    speechHints: speech.speechHints
  };
  shaped.voiceRoute = {
    ...(isObj(shaped.voiceRoute) ? shaped.voiceRoute : {}),
    text: speech.text,
    textDisplay: speech.textDisplay,
    textSpeak: speech.textSpeak,
    routeKind: speech.routeKind,
    intro: speech.intro,
    source: speech.source,
    speechHints: speech.speechHints
  };
  shaped = enforceQuietUiIfNeeded(shaped, {
    supportActive,
    failSafe,
    forceQuiet: suppressMenus
  });

  shaped.voiceRoute = normalizeVoiceRouteResponse(shaped.voiceRoute);
  shaped.requestId = cleanText(shaped.requestId || makeTraceId("req"));
  shaped.traceId = cleanText(shaped.traceId || norm.traceId);

  setLastTurn(sessionId, {
    replyHash: replyHash(reply),
    userHash: replyHash(norm.text),
    lane: shaped.lane || norm.lane
  });

  return res.status(200).json({
    ok: shaped.ok !== false,
    reply: shaped.reply,
    payload: shaped.payload,
    lane: shaped.lane || norm.lane || "general",
    laneId: shaped.laneId || shaped.lane || norm.lane || "general",
    sessionLane: shaped.sessionLane || shaped.lane || norm.lane || "general",
    bridge: shaped.bridge || marion || null,
    ctx: shaped.ctx || {},
    ui: shaped.ui || {},
    directives: Array.isArray(shaped.directives) ? shaped.directives : [],
    followUps: Array.isArray(shaped.followUps) ? shaped.followUps : [],
    followUpsStrings: Array.isArray(shaped.followUpsStrings) ? shaped.followUpsStrings : [],
    sessionPatch: shaped.sessionPatch || {},
    cog: shaped.cog || {},
    requestId: shaped.requestId,
    traceId: shaped.traceId,
    meta: {
      ...(shaped.meta || {}),
      audioContract: {
        version: "audio-first-v1",
        endpoint: routeUrl("/api/tts"),
        healthEndpoint: routeUrl("/api/tts/health"),
        deterministicAudio: true,
        failOpenChat: true
      }
    },
    speech,
    audio: shaped.audio || undefined,
    ttsProfile: shaped.ttsProfile || undefined,
    voiceRoute: shaped.voiceRoute || undefined
  });
});

bootstrapNewsCanadaFeed();

if (newsCanadaRouter) {
  app.use("/api/newscanada", newsCanadaRouter);
  app.use("/newscanada", newsCanadaRouter);
  console.log("[Sandblast][newsCanada] mounted", {
    api: "/api/newscanada",
    direct: "/newscanada",
    stableContract: true,
    legacySlidesDefault: true
  });
} else {
  console.log("[Sandblast][newsCanada] router_missing", {
    stableContract: true,
    legacySlidesDefault: true
  });
}

app.use("/api", (req, res) => {
  applyCors(req, res);
  return res.status(404).json({
    ok: false,
    error: "not_found",
    path: req.path,
    meta: { v: INDEX_VERSION, t: now() }
  });
});

app.use((err, req, res, _next) => {
  console.log("[Sandblast][express:error]", err && (err.stack || err.message || err));
  applyCors(req, res);
  return res.status(500).json({
    ok: false,
    error: "server_error",
    detail: cleanText(err && (err.message || err) || "server error"),
    meta: { v: INDEX_VERSION, t: now() }
  });
});

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

app.get("*", (req, res, next) => {
  const p = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(p)) return res.sendFile(p);
  return next();
});

const server = app.listen(PORT, () => {
  console.log(`[Sandblast] ${INDEX_VERSION} listening on :${PORT}`);
});

module.exports = {
  app,
  server,
  INDEX_VERSION,
  NEWS_CANADA_CONTRACT_VERSION,
  newsCanadaRuntime,
  loadNewsCanadaEditorsPicksFromDisk,
  resolveNewsCanadaDataFile,
  normalizeNewsCanadaFeed,
  hydrateNewsCanadaLocals
};

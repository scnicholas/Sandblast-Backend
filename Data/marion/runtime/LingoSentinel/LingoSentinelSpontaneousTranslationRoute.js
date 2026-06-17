"use strict";

/**
 * LingoSentinelSpontaneousTranslationRoute
 * Express router for spontaneous multilingual translation.
 */

const express = require("express");
const TranslationEngine = require("./LingoSentinelTranslationEngine");
const RealtimeBridge = require("./LingoSentinelRealtimeTranslationBridge");

const VERSION = "2.2.0-spontaneity-translation-route";
const router = express.Router();

function safeBody(req) { return req && req.body && typeof req.body === "object" ? req.body : {}; }
function sendError(res, status, error, extra = {}) { return res.status(status).json({ ok: false, error: error && error.message ? error.message : String(error || "request_failed"), diagnosticsRedacted: true, version: VERSION, ...extra }); }

router.get(["/translation/health", "/translate/health", "/detect/health"], (req, res) => {
  return res.status(200).json({ ...TranslationEngine.health(), routeVersion: VERSION, routes: { translate: "/api/lingosentinel/translate", detect: "/api/lingosentinel/detect", languages: "/api/lingosentinel/languages", translationHealth: "/api/lingosentinel/translation/health" } });
});

router.get("/languages", (req, res) => res.status(200).json(TranslationEngine.languages()));

router.post("/detect", (req, res) => {
  try { return res.status(200).json({ ok: true, ...TranslationEngine.detect(safeBody(req), safeBody(req)), routeVersion: VERSION }); }
  catch (error) { return sendError(res, 500, error); }
});

router.post("/translate", async (req, res) => {
  try {
    const result = await TranslationEngine.translateTurn(safeBody(req), {});
    return res.status(result.ok === false && result.stage === "unsupported_target_language" ? 400 : 200).json({ ...result, routeVersion: VERSION });
  } catch (error) { return sendError(res, 500, error); }
});

router.post("/publish/translate", async (req, res) => {
  try {
    const result = await RealtimeBridge.buildTranslatedPublishInput(safeBody(req), {});
    return res.status(200).json({ ok: true, ...result, routeVersion: VERSION });
  } catch (error) { return sendError(res, 500, error); }
});

module.exports = router;
module.exports.VERSION = VERSION;

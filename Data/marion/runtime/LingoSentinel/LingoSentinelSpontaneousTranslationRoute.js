'use strict';

/**
 * LingoSentinelSpontaneousTranslationRoute
 * Express route for real dynamic translation.
 *
 * Mount under:
 *   app.use('/api/lingosentinel', require('./Data/marion/runtime/LingoSentinel/LingoSentinelSpontaneousTranslationRoute'))
 *
 * Endpoints:
 *   POST /api/lingosentinel/translate
 *   POST /api/lingosentinel/detect
 *   GET  /api/lingosentinel/translation/health
 */

const express = require('express');
const TranslationEngine = require('./LingoSentinelTranslationEngine');

const VERSION = '2.1.0-spontaneous-translation-route';
const MAX_BODY_TEXT_BYTES = Number(process.env.LINGOSENTINEL_TRANSLATE_MAX_BYTES) || 12000;
const router = express.Router();

function safeString(value, fallback = '') {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function hardenNoStore(res) {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
  } catch (_) {}
}

function readText(body = {}) {
  return safeString(body.text || body.message || body.body || body.input || body.prompt || '');
}

function validateTranslateBody(body = {}) {
  const text = readText(body);
  const errors = [];
  if (!text) errors.push('text_required');
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_TEXT_BYTES) errors.push('text_too_large');
  return { ok: errors.length === 0, errors, text };
}

function publicError(error, stage = 'translation_route_failed') {
  return {
    ok: false,
    stage,
    error: error && error.message ? error.message : 'translation_failed',
    diagnosticsRedacted: true,
    publicSurface: 'Nyx',
    finalAuthority: 'Marion',
    routeVersion: VERSION,
    timestamp: nowIso()
  };
}

router.options('/translate', (req, res) => {
  hardenNoStore(res);
  return res.status(204).end();
});

router.post('/translate', async (req, res) => {
  hardenNoStore(res);
  const receivedAt = nowIso();

  try {
    const body = req.body || {};
    const validation = validateTranslateBody(body);

    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        stage: 'translate_validation',
        errors: validation.errors,
        diagnosticsRedacted: true,
        routeVersion: VERSION,
        telemetry: { receivedAt, completedAt: nowIso() }
      });
    }

    const result = await TranslationEngine.translateTurn({
      ...body,
      text: validation.text,
      source: 'lingosentinel-spontaneous-translation-route'
    });

    return res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      stage: result.stage,
      text: result.text,
      originalText: result.originalText,
      translatedText: result.translatedText,
      sourceLanguage: result.sourceLanguage,
      detectedLanguage: result.detectedLanguage,
      targetLanguage: result.targetLanguage,
      provider: result.provider,
      confidence: result.confidence,
      tone: result.tone,
      contextUsed: result.contextUsed,
      sessionId: result.sessionId,
      turnId: result.turnId,
      fallback: result.fallback === true,
      publicSurface: 'Nyx',
      finalAuthority: 'Marion',
      marionAuthority: true,
      diagnosticsRedacted: true,
      routeVersion: VERSION,
      telemetry: {
        receivedAt,
        completedAt: nowIso(),
        engineVersion: TranslationEngine.VERSION
      }
    });
  } catch (error) {
    return res.status(500).json(publicError(error));
  }
});

router.post('/detect', (req, res) => {
  hardenNoStore(res);
  try {
    const body = req.body || {};
    const result = TranslationEngine.detect(body, body);
    return res.status(200).json({
      ok: result.ok !== false,
      language: result.language,
      detectedLanguage: result.detectedLanguage,
      confidence: result.confidence,
      mixed: result.mixed,
      candidates: result.candidates || [],
      diagnosticsRedacted: true,
      routeVersion: VERSION,
      timestamp: nowIso()
    });
  } catch (error) {
    return res.status(500).json(publicError(error, 'detect_failed'));
  }
});

router.get('/translation/health', (req, res) => {
  hardenNoStore(res);
  return res.status(200).json({
    ...TranslationEngine.health(),
    routeMounted: true,
    routeVersion: VERSION,
    routes: {
      translate: '/api/lingosentinel/translate',
      detect: '/api/lingosentinel/detect',
      health: '/api/lingosentinel/translation/health'
    }
  });
});

router.VERSION = VERSION;
router.translateTurn = TranslationEngine.translateTurn;
router.detectLanguage = TranslationEngine.detect;
module.exports = router;

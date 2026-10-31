'use strict';

/**
 * Sandblast LingoSentinel public translation route.
 * Preserves POST /api/lingosentinel/translate and the existing coordinator contract.
 * This module does not bypass Marion's private authorization or expose voice routes.
 */
const express = require('express');
const Orchestrator = require('../runtime/LingoSentinel/LingoSentinelContextualTranslationCoordinator');
const ProtectedTerms = require('../runtime/LingoSentinel/LingoSentinelProtectedTerms');

const VERSION = 'nyx.lingosentinel.translationRoutes/12.1-public-hardening';
const MAX_TEXT = 8000;
const MAX_TERMS = 64;
const MAX_TERM_LENGTH = 128;
const MAX_ID = 128;
const LANGUAGE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/;
const SAFE_ERROR = /^[A-Z][A-Z0-9_]{2,79}$/;

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function stringField(value, limit) {
  return typeof value === 'string' && value.length <= limit ? value : null;
}
function languageField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return LANGUAGE.test(normalized) ? normalized : null;
}
function boundedId(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return stringField(value, MAX_ID);
}
function safeError(value) {
  return typeof value === 'string' && SAFE_ERROR.test(value)
    ? value : 'LINGOSENTINEL_TRANSLATION_FAILED';
}
function invalid(res, requestId, error) {
  return res.status(400).json({ ok: false, requestId, error });
}

function registerLingoSentinelTranslationRoutes(app) {
  if (!app || typeof app.use !== 'function') {
    throw new TypeError('LINGOSENTINEL_APP_CONTRACT_INVALID');
  }
  if (!express || typeof express.Router !== 'function' ||
      !Orchestrator || typeof Orchestrator.translate !== 'function' ||
      !ProtectedTerms || typeof ProtectedTerms.normalize !== 'function') {
    throw new TypeError('LINGOSENTINEL_DEPENDENCY_CONTRACT_INVALID');
  }

  const router = express.Router();
  router.options('/translate', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(204).end();
  });
  router.post('/translate', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const rawId = req && req.headers && req.headers['x-request-id'];
    const requestId = typeof rawId === 'string' && rawId.length <= MAX_ID ? rawId : '';
    try {
      const body = req && req.body;
      if (!plainObject(body)) return invalid(res, requestId, 'TRANSLATION_BODY_INVALID');
      const source = languageField(body.source ?? body.sourceLanguage, 'en');
      const target = languageField(body.target ?? body.targetLanguage, source);
      if (!source || !target) return invalid(res, requestId, 'TRANSLATION_LANGUAGE_INVALID');
      const text = stringField(body.text, MAX_TEXT);
      if (text === null) return invalid(res, requestId, 'TRANSLATION_TEXT_INVALID');
      if (!text.trim()) return invalid(res, requestId, 'TRANSLATION_TEXT_REQUIRED');
      const preserve = body.preserve === undefined ? [] : body.preserve;
      if (!Array.isArray(preserve) || preserve.length > MAX_TERMS ||
          preserve.some(term => typeof term !== 'string' || !term || term.length > MAX_TERM_LENGTH)) {
        return invalid(res, requestId, 'TRANSLATION_PROTECTED_TERMS_INVALID');
      }
      const roomId = boundedId(body.roomId, 'direct-translation');
      const messageId = boundedId(body.messageId, requestId || 'direct');
      if (roomId === null || messageId === null) return invalid(res, requestId, 'TRANSLATION_ID_INVALID');
      const locale = body.locale === undefined ? undefined : stringField(body.locale, 48);
      const formality = body.formality === undefined ? undefined : stringField(body.formality, 48);
      if (locale === null || formality === null) return invalid(res, requestId, 'TRANSLATION_OPTION_INVALID');

      if (source === target) {
        return res.status(200).json({
          ok: true, requestId, translatedText: text, source, target,
          confidence: 1, provider: 'bypass', status: 'not_required'
        });
      }
      const normalized = ProtectedTerms.normalize(preserve);
      const result = await Orchestrator.translate({
        roomId, messageId, sourceLanguage: source, targetLanguage: target,
        originalText: text, text, locale, formality, protectedTerms: normalized
      }, { manual: true });
      if (!result || result.ok !== true) {
        return res.status(503).json({
          ok: false, requestId, error: safeError(result && result.error), status: 'failed'
        });
      }
      if (typeof result.translatedText !== 'string' || !result.translatedText.trim()) {
        return res.status(502).json({ ok: false, requestId, error: 'LINGOSENTINEL_INVALID_TRANSLATION_RESPONSE' });
      }
      return res.status(200).json({
        ok: true, requestId, translatedText: result.translatedText, source, target,
        confidence: typeof result.confidence === 'number' && Number.isFinite(result.confidence)
          ? Math.min(1, Math.max(0, result.confidence)) : null,
        provider: typeof result.provider === 'string' ? result.provider.slice(0, 64) : 'internal',
        status: typeof result.status === 'string' ? result.status.slice(0, 64) : 'translated'
      });
    } catch (_) {
      // Do not leak translation-provider errors, paths or private internals.
      return res.status(503).json({
        ok: false, requestId, error: 'LINGOSENTINEL_TRANSLATION_FAILED', status: 'failed'
      });
    }
  });
  app.use('/api/lingosentinel', router);
  return router;
}

module.exports = { VERSION, registerLingoSentinelTranslationRoutes };

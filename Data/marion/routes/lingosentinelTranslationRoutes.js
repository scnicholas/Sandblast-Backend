'use strict';

/**
 * Sandblast LingoSentinel public translation route.
 * Preserves POST /api/lingosentinel/translate, the existing registration export,
 * and the ContextualTranslationCoordinator.translate(payload, { manual: true }) contract.
 * This is NOT the separate Phase 5A public-boundary module.
 */
const express = require('express');
const Orchestrator = require('../runtime/LingoSentinel/LingoSentinelContextualTranslationCoordinator');
const ProtectedTerms = require('../runtime/LingoSentinel/LingoSentinelProtectedTerms');

const VERSION = 'nyx.lingosentinel.translationRoutes/12.2-public-hardening';
const MAX_TEXT = 8000;
const MAX_TRANSLATION = 32000;
const MAX_TERMS = 64;
const MAX_TERM_LENGTH = 128;
const MAX_ID = 128;
const MAX_OPTION = 48;
const MAX_BODY_KEYS = 32;
const LANGUAGE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const SAFE_OPTION = /^[\p{L}\p{N} _.-]+$/u;
const SAFE_META = /^[A-Za-z0-9_.:-]{1,64}$/;
const SAFE_ERROR = /^LINGOSENTINEL_[A-Z0-9_]{1,64}$/;

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return Object.prototype.toString.call(value) === '[object Object]' &&
    (proto === null || Object.getPrototypeOf(proto) === null);
}
function ownValue(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ? descriptor.value : undefined;
}
function stringField(value, limit) {
  return typeof value === 'string' && value.length <= limit ? value : null;
}
function languageField(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || value.length > 32) return null;
  const normalized = value.trim().toLowerCase();
  return LANGUAGE.test(normalized) ? normalized : null;
}
function boundedId(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return typeof value === 'string' && value.length <= MAX_ID && SAFE_ID.test(value)
    ? value : null;
}
function optionField(value) {
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.length <= MAX_OPTION &&
    SAFE_OPTION.test(value) ? value : null;
}
function safeError(value) {
  return typeof value === 'string' && SAFE_ERROR.test(value)
    ? value : 'LINGOSENTINEL_TRANSLATION_FAILED';
}
function safeMeta(value, fallback) {
  return typeof value === 'string' && SAFE_META.test(value) ? value : fallback;
}
function invalid(res, requestId, error) {
  return res.status(400).json({ ok: false, requestId, error });
}
function selectLanguage(body, primary, alias, fallback) {
  const first = ownValue(body, primary);
  const second = ownValue(body, alias);
  const a = languageField(first, fallback);
  const b = languageField(second, fallback);
  // Both explicit aliases must agree; neither may hide an invalid value.
  if (a === null || b === null) return null;
  if (first !== undefined && second !== undefined && a !== b) return null;
  return first === undefined ? b : a;
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
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const rawId = req && req.headers && req.headers['x-request-id'];
    const requestId = typeof rawId === 'string' && rawId.length <= MAX_ID && SAFE_ID.test(rawId)
      ? rawId : '';
    try {
      const body = req && req.body;
      if (!plainObject(body) || Object.keys(body).length > MAX_BODY_KEYS) {
        return invalid(res, requestId, 'TRANSLATION_BODY_INVALID');
      }
      const source = selectLanguage(body, 'source', 'sourceLanguage', 'en');
      const target = selectLanguage(body, 'target', 'targetLanguage', source);
      if (!source || !target) return invalid(res, requestId, 'TRANSLATION_LANGUAGE_INVALID');

      const text = stringField(ownValue(body, 'text'), MAX_TEXT);
      if (text === null) return invalid(res, requestId, 'TRANSLATION_TEXT_INVALID');
      if (!text.trim()) return invalid(res, requestId, 'TRANSLATION_TEXT_REQUIRED');
      const suppliedTerms = ownValue(body, 'preserve');
      const preserve = suppliedTerms === undefined ? [] : suppliedTerms;
      if (!Array.isArray(preserve) || preserve.length > MAX_TERMS ||
          preserve.some(term => typeof term !== 'string' || !term.trim() ||
            term.length > MAX_TERM_LENGTH || /[\u0000-\u001f\u007f]/.test(term))) {
        return invalid(res, requestId, 'TRANSLATION_PROTECTED_TERMS_INVALID');
      }
      const roomId = boundedId(ownValue(body, 'roomId'), 'direct-translation');
      const messageId = boundedId(ownValue(body, 'messageId'), requestId || 'direct');
      if (roomId === null || messageId === null) return invalid(res, requestId, 'TRANSLATION_ID_INVALID');
      const locale = optionField(ownValue(body, 'locale'));
      const formality = optionField(ownValue(body, 'formality'));
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
      if (typeof result.translatedText !== 'string' || !result.translatedText.trim() ||
          result.translatedText.length > MAX_TRANSLATION) {
        return res.status(502).json({
          ok: false, requestId, error: 'LINGOSENTINEL_INVALID_TRANSLATION_RESPONSE'
        });
      }
      return res.status(200).json({
        ok: true, requestId, translatedText: result.translatedText, source, target,
        confidence: typeof result.confidence === 'number' && Number.isFinite(result.confidence)
          ? Math.min(1, Math.max(0, result.confidence)) : null,
        provider: safeMeta(result.provider, 'internal'),
        status: safeMeta(result.status, 'translated')
      });
    } catch (_) {
      // Provider exceptions, internal paths and authentication context stay private.
      return res.status(503).json({
        ok: false, requestId, error: 'LINGOSENTINEL_TRANSLATION_FAILED', status: 'failed'
      });
    }
  });
  app.use('/api/lingosentinel', router);
  return router;
}

module.exports = { VERSION, registerLingoSentinelTranslationRoutes };

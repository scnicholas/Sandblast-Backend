'use strict';

/**
 * LingoSentinel Phase 5A: isolated, opt-in public translation boundary.
 *
 * Mounts POST /api/lingosentinel/public/translate (distinct from the existing
 * POST /api/lingosentinel/translate). Never imports Marion private modules.
 *
 * To enable, set LINGOSENTINEL_PUBLIC_TRANSLATION_ENABLED=true AND configure
 * app.locals.lingoSentinelPublicTranslationHandler with a trusted, PUBLIC-ONLY
 * translation implementation. The function receives only { text, source, target }
 * and must return { translatedText: string }.
 *
 * Production deployments should also configure a shared rate-limiting middleware
 * at app.locals.lingoSentinelPublicTranslationRateLimit. Without it, the
 * endpoint fails closed with HTTP 503, even if enabled.
 */

const MAX_TEXT_LENGTH = 2000;
const MAX_TRANSLATION_LENGTH = 8000;
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z]{2,4})?(?:-[a-z0-9]{2,8})?$/i;
const ALLOWED_KEYS = new Set(['text', 'source', 'target']);
const registeredApps = new WeakMap();

function plainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function safeLanguage(value) {
  return typeof value === 'string' && value.length <= 32 &&
    LANGUAGE_TAG.test(value) ? value.toLowerCase() : null;
}

function validateBody(body) {
  if (!plainRecord(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 3 || keys.some(key => !ALLOWED_KEYS.has(key))) return null;
  // Accessor properties are not allowed (defence in depth for non-JSON inputs).
  if (keys.some(key => !Object.prototype.hasOwnProperty.call(
    Object.getOwnPropertyDescriptor(body, key) || {}, 'value'
  ))) return null;
  const { text, source, target } = body;
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  const cleanSource = safeLanguage(source);
  const cleanTarget = safeLanguage(target);
  if (!cleanSource || !cleanTarget || cleanSource === cleanTarget) return null;
  return Object.freeze({ text, source: cleanSource, target: cleanTarget });
}

function registerLingoSentinelPublicTranslationBoundaryRoutes(app) {
  if (!app || typeof app.use !== 'function') {
    throw new TypeError('A compatible Express app is required');
  }
  if (registeredApps.has(app)) return registeredApps.get(app);

  const enabled = process.env.LINGOSENTINEL_PUBLIC_TRANSLATION_ENABLED === 'true';
  if (!enabled) {
    const outcome = Object.freeze({ ok: true, mounted: false, enabled: false,
      reason: 'PUBLIC_TRANSLATION_DISABLED' });
    registeredApps.set(app, outcome);
    return outcome;
  }

  const express = require('express');
  const router = express.Router();
  // Separate, opt-in route. The existing /api/lingosentinel/translate is untouched.
  const path = '/api/lingosentinel/public';

  router.options('/translate', (_req, res) => res.status(204).end());
  const requirePublicService = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const handler = app.locals && app.locals.lingoSentinelPublicTranslationHandler;
    const limiter = app.locals && app.locals.lingoSentinelPublicTranslationRateLimit;
    if (typeof handler !== 'function' || typeof limiter !== 'function') {
      return res.status(503).json({ ok: false, error: 'PUBLIC_TRANSLATION_UNAVAILABLE' });
    }
    // The trusted limiter is ordinary Express middleware: it calls next()
    // on approval or terminates the response on rejection.
    try {
      const returned = limiter(req, res, next);
      if (returned && typeof returned.catch === 'function') {
        returned.catch(() => {
          if (!res.headersSent) res.status(503).json({
            ok: false, error: 'PUBLIC_TRANSLATION_UNAVAILABLE'
          });
        });
      }
    } catch (_) {
      if (!res.headersSent) res.status(503).json({
        ok: false, error: 'PUBLIC_TRANSLATION_UNAVAILABLE'
      });
    }
  };

  router.post('/translate', requirePublicService,
    express.json({ limit: '8kb', strict: true }), async (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ ok: false, error: 'JSON_REQUIRED' });
    }
    const request = validateBody(req.body);
    if (!request) return res.status(400).json({ ok: false, error: 'INVALID_TRANSLATION_REQUEST' });

    try {
      // Only these three public values cross the trust boundary.
      const result = await handler(request);
      if (!plainRecord(result) || typeof result.translatedText !== 'string' ||
          !result.translatedText.trim() ||
          result.translatedText.length > MAX_TRANSLATION_LENGTH) {
        return res.status(502).json({ ok: false, error: 'INVALID_TRANSLATION_RESPONSE' });
      }
      return res.status(200).json({
        ok: true,
        translatedText: result.translatedText,
        source: request.source,
        target: request.target
      });
    } catch (_) {
      return res.status(503).json({ ok: false, error: 'PUBLIC_TRANSLATION_UNAVAILABLE' });
    }
  });
  // Keep JSON parse errors generic. Never reveal parser details or request body.
  router.use((err, _req, res, next) => {
    if (!err) return next();
    if (res.headersSent) return next(err);
    return res.status(err.status === 413 ? 413 : 400)
      .json({ ok: false, error: err.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON' });
  });

  app.use(path, router);
  const outcome = Object.freeze({ ok: true, mounted: true, enabled: true,
    path: `${path}/translate` });
  registeredApps.set(app, outcome);
  return outcome;
}

module.exports = {
  VERSION: 'lingosentinel.public-boundary/1.0',
  registerLingoSentinelPublicTranslationBoundaryRoutes
};

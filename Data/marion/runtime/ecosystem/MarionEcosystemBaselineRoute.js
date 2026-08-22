'use strict';

const crypto = require('crypto');
const express = require('express');
const Health = require('./MarionEcosystemBaselineHealth');
const Manifest = require('./MarionEcosystemBaselineManifest');

const router = express.Router();
const VERSION = 'marion.ecosystemBaselineRoute/1.0.0';

function harden(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function secureEqual(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));

  return (
    A.length > 0 &&
    A.length === B.length &&
    crypto.timingSafeEqual(A, B)
  );
}

function authorize(req) {
  const expected = String(
    process.env.MARION_BASELINE_INTERNAL_TOKEN ||
    process.env.MARION_INTERNAL_TOKEN ||
    ''
  ).trim();

  if (!expected) {
    return {
      ok: process.env.NODE_ENV !== 'production',
      status: 503,
      error: 'baseline_internal_token_not_configured'
    };
  }

  const got = String(
    req.get('x-marion-baseline-token') ||
    req.get('x-marion-internal-token') ||
    ''
  ).trim();

  return secureEqual(got, expected)
    ? { ok: true }
    : { ok: false, status: 403, error: 'baseline_internal_token_invalid' };
}

router.get('/baseline/health', (req, res) => {
  const auth = authorize(req);
  if (!auth.ok) {
    harden(res);
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
      routeVersion: VERSION
    });
  }

  harden(res);
  const health = Health.getHealth();

  return res.status(health.ok ? 200 : 503).json({
    ...health,
    routeVersion: VERSION
  });
});

router.get('/baseline/manifest', (req, res) => {
  const auth = authorize(req);
  if (!auth.ok) {
    harden(res);
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
      routeVersion: VERSION
    });
  }

  harden(res);
  return res.status(200).json({
    ok: true,
    baseline: Manifest.BASELINE,
    routeVersion: VERSION
  });
});

function register(app) {
  if (!app || typeof app.use !== 'function') return false;
  app.use('/api/marion/ecosystem', router);
  return true;
}

module.exports = router;
module.exports.router = router;
module.exports.register = register;
module.exports.VERSION = VERSION;

'use strict';

const crypto = require('crypto');
const express = require('express');

const Bootstrap = require('./MarionEcosystemPhase5Bootstrap');
const Router = require('./MarionDomainIntelligenceRouter');

const router = express.Router();
const VERSION = 'marion.ecosystemPhase5Route/5.0';

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
    process.env.MARION_DOMAIN_INTERNAL_TOKEN ||
    process.env.MARION_INTERNAL_TOKEN ||
    ''
  ).trim();

  if (!expected) {
    return {
      ok: process.env.NODE_ENV !== 'production',
      status: 503,
      error: 'domain_internal_token_not_configured'
    };
  }

  const got = String(
    req.get('x-marion-domain-token') ||
    req.get('x-marion-internal-token') ||
    ''
  ).trim();

  return secureEqual(got, expected)
    ? { ok: true }
    : {
        ok: false,
        status: 403,
        error: 'domain_internal_token_invalid'
      };
}

function deny(res, auth) {
  harden(res);

  return res
    .status(auth.status || 403)
    .json({
      ok: false,
      error: auth.error || 'forbidden',
      routeVersion: VERSION
    });
}

function body(req) {
  return req.body && typeof req.body === 'object'
    ? req.body
    : {};
}

function statusFor(result) {
  if (result.ok) return 200;
  if (result.stage === 'contract') return 400;
  if (result.stage === 'conflict' || result.stage === 'duplicate_inflight') return 409;
  return 503;
}

router.get('/domain/health', (req, res) => {
  harden(res);

  if (!Bootstrap.getHealth().booted) {
    Bootstrap.bootstrap();
  }

  const health = Bootstrap.getHealth();

  return res
    .status(health.ok ? 200 : 503)
    .json({
      ...health,
      routeVersion: VERSION
    });
});

router.post('/domain/request', async (req, res) => {
  const auth = authorize(req);
  if (!auth.ok) return deny(res, auth);

  harden(res);

  if (!Bootstrap.getHealth().booted) {
    Bootstrap.bootstrap();
  }

  const result = await Router.route({
    ...body(req),
    source: 'marion'
  });

  return res
    .status(statusFor(result))
    .json({
      ...result,
      routeVersion: VERSION
    });
});

router.post('/domain/chronicle', async (req, res) => {
  const auth = authorize(req);
  if (!auth.ok) return deny(res, auth);

  harden(res);

  if (!Bootstrap.getHealth().booted) {
    Bootstrap.bootstrap();
  }

  const result = await Router.route({
    ...body(req),
    source: 'marion',
    domain: 'chronicle'
  });

  return res
    .status(statusFor(result))
    .json({
      ...result,
      routeVersion: VERSION
    });
});

router.post('/domain/guardians', async (req, res) => {
  const auth = authorize(req);
  if (!auth.ok) return deny(res, auth);

  harden(res);

  if (!Bootstrap.getHealth().booted) {
    Bootstrap.bootstrap();
  }

  const result = await Router.route({
    ...body(req),
    source: 'marion',
    domain: 'project-guardians'
  });

  return res
    .status(statusFor(result))
    .json({
      ...result,
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

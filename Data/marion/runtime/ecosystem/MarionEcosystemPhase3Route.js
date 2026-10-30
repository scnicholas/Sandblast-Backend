'use strict';

const crypto = require('crypto');
const express = require('express');

const Contract = require('./MarionEcosystemContract');
const Bootstrap = require('./MarionEcosystemPhase3Bootstrap');
const CrmRouter = require('./MarionCrmEventRouter');
const Normalizer = require('./MarionCrmLeadNormalizer');
const Scorer = require('./MarionCrmLeadScorer');
const Recommendation = require('./MarionCrmRecommendationPolicy');
const GoHighLevel = require('./MarionGoHighLevelReadAdapter');

const router = express.Router();
const VERSION = 'marion.ecosystemPhase3Route/3.0';

function harden(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function body(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
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
    process.env.CRM_ECOSYSTEM_INGEST_TOKEN ||
    process.env.MARION_ECOSYSTEM_TOKEN ||
    ''
  ).trim();

  if (!expected) {
    return {
      ok: process.env.NODE_ENV !== 'production',
      status: 503,
      error: 'crm_ingest_token_not_configured'
    };
  }

  const got = String(
    req.get('x-sb-crm-token') ||
    req.get('x-sb-ecosystem-token') ||
    ''
  ).trim();

  return secureEqual(got, expected)
    ? { ok: true }
    : { ok: false, status: 403, error: 'crm_ingest_token_invalid' };
}

function deny(res, result) {
  harden(res);

  return res
    .status(result.status || 403)
    .json({
      ok: false,
      error: result.error || 'forbidden',
      version: VERSION
    });
}

function statusFor(result) {
  if (result.ok) return 200;
  if (result.stage === 'contract' || result.stage === 'lead_contract') return 400;
  if (result.stage === 'permission') return 403;
  return 503;
}

router.get('/crm/health', (req, res) => {
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

router.post('/crm/preview', (req, res) => {
  const auth = authorize(req);
  if (!auth.ok) return deny(res, auth);

  harden(res);

  const lead = Normalizer.normalize(body(req));
  const validation = Normalizer.validate(lead);

  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      stage: 'lead_contract',
      errors: validation.errors,
      routeVersion: VERSION
    });
  }

  const scoring = Scorer.score(lead);
  const recommendation = Recommendation.recommend(lead, scoring);

  return res.status(200).json({
    ok: true,
    lead,
    scoring,
    recommendation,
    controls: {
      readOnly: true,
      executeAutomatically: false,
      humanApprovalRequired: true
    },
    routeVersion: VERSION
  });
});

router.post('/crm/lead', async (req, res) => {
  const auth = authorize(req);
  if (!auth.ok) return deny(res, auth);

  harden(res);

  if (!Bootstrap.getHealth().booted) {
    Bootstrap.bootstrap();
  }

  const input = body(req);

  const result = await CrmRouter.route({
    requestId: input.requestId,
    traceId: input.traceId,
    sessionId: input.sessionId,
    eventType:
      input.eventType === 'lead.created'
        ? 'lead.created'
        : 'lead.updated',
    provider: input.provider || 'crm',
    lead: input.lead || input
  });

  return res
    .status(statusFor(result))
    .json({
      ...result,
      routeVersion: VERSION
    });
});

router.post('/crm/gohighlevel/read', async (req, res) => {
  const auth = authorize(req);
  if (!auth.ok) return deny(res, auth);

  harden(res);

  try {
    const input = body(req);

    const snapshot = await GoHighLevel.getLeadSnapshot({
      contactId: input.contactId,
      opportunityId: input.opportunityId
    });

    const result = await CrmRouter.route({
      requestId: input.requestId,
      traceId: input.traceId,
      sessionId: input.sessionId,
      eventType: 'lead.updated',
      provider: 'gohighlevel',
      lead: snapshot
    });

    return res
      .status(statusFor(result))
      .json({
        ...result,
        routeVersion: VERSION
      });

  } catch (error) {
    return res.status(503).json({
      ok: false,
      stage: 'gohighlevel_read',
      errors: [
        String(
          error &&
          (error.code || error.message || error.name) ||
          'gohighlevel_read_failed'
        ).slice(0, 180)
      ],
      routeVersion: VERSION
    });
  }
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

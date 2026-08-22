'use strict';

const express = require('express');
const Bridge = require('./MarionLingoSentinelBridge');
const Contract = require('./MarionLingoSentinelContract');

const router = express.Router();
const VERSION = 'marion.lingosentinel.route/1.0';

function harden(res) {
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  res.setHeader('X-Content-Type-Options','nosniff');
}
function authorized(req) {
  const expected = String(process.env.LS_WIDGET_TOKEN || process.env.LINGOSENTINEL_WIDGET_TOKEN || '').trim();
  if (!expected) return true;
  return String(req.get('x-sb-widget-token') || '').trim() === expected;
}
function body(req) { return req.body && typeof req.body === 'object' ? req.body : {}; }
function deny(res) { harden(res); return res.status(403).json({ ok:false, error:'forbidden', version:VERSION }); }

router.get('/marion/health', (req,res) => { harden(res); return res.status(200).json({ ...Bridge.getHealth(), routeVersion:VERSION }); });
router.post('/marion/handshake', async (req,res) => {
  if (!authorized(req)) return deny(res); harden(res);
  const result = await Bridge.runMarionLingoSentinelBridge({ ...body(req), eventType:'handshake.request', source:'lingosentinel', target:'marion' });
  return res.status(result.ok ? 200 : 503).json({ ...result, version:VERSION });
});
router.post('/marion/request', async (req,res) => {
  if (!authorized(req)) return deny(res); harden(res);
  const input = body(req);
  const env = input.contract === Contract.CONTRACT ? input : Contract.createEnvelope(input);
  const result = await Bridge.runMarionLingoSentinelBridge(env);
  const status = result.ok ? 200 : result.stage === 'contract' ? 400 : result.stage === 'timeout' ? 504 : 503;
  return res.status(status).json({ ...result, version:VERSION });
});

function createRouter() { return router; }
function register(app) { if (!app || typeof app.use !== 'function') return false; app.use('/api/lingosentinel', router); return true; }

module.exports = router;
module.exports.router = router;
module.exports.createRouter = createRouter;
module.exports.register = register;
module.exports.VERSION = VERSION;

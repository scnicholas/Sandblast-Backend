'use strict';

const express = require('express');
const Bridge = require('./MarionLingoSentinelStateBridge');

const router = express.Router();
const VERSION = 'marion.lingosentinel.stateRoute/2.0';

function harden(res) {
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma','no-cache'); res.setHeader('Expires','0'); res.setHeader('X-Content-Type-Options','nosniff');
}
function token(req, name) { return String(req.get(name) || '').trim(); }
function widgetAuthorized(req) {
  const expected = String(process.env.LS_WIDGET_TOKEN || process.env.LINGOSENTINEL_WIDGET_TOKEN || '').trim();
  return !expected || token(req,'x-sb-widget-token') === expected;
}
function internalAuthorized(req) {
  const expected = String(process.env.MARION_INTERNAL_TOKEN || '').trim();
  return !!expected && token(req,'x-marion-internal-token') === expected;
}
function body(req) { return req.body && typeof req.body === 'object' ? req.body : {}; }
function deny(res, code = 'forbidden') { harden(res); return res.status(403).json({ ok:false, error:code, version:VERSION }); }

router.get('/marion/state/health',(req,res)=>{ harden(res); return res.status(200).json({ ...Bridge.getHealth(), routeVersion:VERSION }); });
router.post('/marion/state/sync',(req,res)=>{
  if (!widgetAuthorized(req)) return deny(res); harden(res);
  const result = Bridge.syncFromLingo(body(req));
  return res.status(result.ok ? 200 : 400).json({ ...result, version:VERSION });
});
router.post('/marion/state/get',(req,res)=>{
  if (!widgetAuthorized(req)) return deny(res); harden(res);
  const result = Bridge.getState(body(req).sessionId);
  return res.status(result.ok ? 200 : 404).json({ ...result, version:VERSION });
});
router.post('/marion/state/commands',(req,res)=>{
  if (!widgetAuthorized(req)) return deny(res); harden(res);
  const b = body(req), result = Bridge.getCommands(b.sessionId,b.after,b.limit);
  return res.status(200).json({ ...result, version:VERSION });
});
router.post('/marion/state/ack',(req,res)=>{
  if (!widgetAuthorized(req)) return deny(res); harden(res);
  const result = Bridge.acknowledgeCommand(body(req));
  return res.status(result.ok ? 200 : 404).json({ ...result, version:VERSION });
});
router.post('/marion/state/command',(req,res)=>{
  if (!internalAuthorized(req)) return deny(res,'internal_token_required'); harden(res);
  const b = body(req), result = Bridge.queueMarionCommand(b.sessionId,b.action,b.value,{ reason:b.reason, metadata:b.metadata });
  return res.status(result.ok ? 202 : 400).json({ ...result, version:VERSION });
});

function createRouter(){ return router; }
function register(app){ if (!app || typeof app.use !== 'function') return false; app.use('/api/lingosentinel',router); return true; }

module.exports = router;
module.exports.router = router;
module.exports.createRouter = createRouter;
module.exports.register = register;
module.exports.VERSION = VERSION;

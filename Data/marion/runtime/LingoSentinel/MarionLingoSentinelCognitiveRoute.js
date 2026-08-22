'use strict';

const express = require('express');
const Orchestrator = require('./MarionLingoSentinelCognitiveOrchestrator');
const History = require('./MarionLingoSentinelConversationStore');
const router = express.Router();
const VERSION = 'marion.lingosentinel.cognitiveRoute/3.0';

function harden(res){ res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.setHeader('X-Content-Type-Options','nosniff'); }
function token(req,n){ return String(req.get(n)||'').trim(); }
function authorized(req){ const expected=String(process.env.LS_WIDGET_TOKEN||process.env.LINGOSENTINEL_WIDGET_TOKEN||'').trim(); return !expected||token(req,'x-sb-widget-token')===expected; }
function body(req){ return req.body&&typeof req.body==='object'?req.body:{}; }
function deny(res){ harden(res); return res.status(403).json({ok:false,error:'forbidden',version:VERSION}); }

router.get('/marion/cognitive/health',(req,res)=>{ harden(res); const h=Orchestrator.getHealth(); return res.status(h.ok?200:503).json({...h,routeVersion:VERSION}); });
router.post('/marion/cognitive/request',async(req,res)=>{
  if(!authorized(req)) return deny(res); harden(res);
  const r=await Orchestrator.orchestrate(body(req));
  const status=r.ok?200:r.stage==='contract'?400:r.stage==='input_translation'?422:r.stage==='timeout'?504:503;
  return res.status(status).json({...r,routeVersion:VERSION});
});
router.post('/marion/cognitive/history/clear',(req,res)=>{
  if(!authorized(req)) return deny(res); harden(res); const b=body(req);
  return res.status(200).json({ok:History.clear(b.sessionId,b.conversationId||'default'),version:VERSION});
});
function createRouter(){return router;} function register(app){if(!app||typeof app.use!=='function')return false;app.use('/api/lingosentinel',router);return true;}
module.exports=router; module.exports.router=router; module.exports.createRouter=createRouter; module.exports.register=register; module.exports.VERSION=VERSION;

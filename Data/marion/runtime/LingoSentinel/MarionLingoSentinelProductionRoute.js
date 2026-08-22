'use strict';

const express=require('express');
const Gateway=require('./MarionLingoSentinelProductionGateway');
const Policy=require('./MarionLingoSentinelProductionPolicy');
const Telemetry=require('./MarionLingoSentinelTelemetry');

const router=express.Router();
const VERSION='marion.lingosentinel.productionRoute/4.0';

function harden(res){
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Vary','Origin');
}
function body(req){return req.body&&typeof req.body==='object'?req.body:{};}
function headers(req){return req&&req.headers||{};}
function deny(res,result){harden(res);return res.status(result.status||403).json({ok:false,error:result.error||'forbidden',version:VERSION});}
function statusFor(r){
  if(r.ok)return 200;
  if(r.stage==='contract'||r.stage==='policy')return 400;
  if(r.stage==='rate_limit')return 429;
  if(r.stage==='duplicate_inflight'||r.stage==='conflict')return 409;
  if(r.stage==='timeout')return 504;
  return 503;
}

router.options(['/marion/production/request','/marion/production/metrics'],(req,res)=>{harden(res);return res.status(204).end();});
router.get('/marion/production/health',(req,res)=>{harden(res);const h=Gateway.getHealth();return res.status(h.ok?200:503).json({...h,routeVersion:VERSION});});
router.post('/marion/production/request',async(req,res)=>{
  const auth=Policy.authorizeWidget({headers:headers(req),origin:req.get('origin')||''});
  if(!auth.ok)return deny(res,auth);
  harden(res);
  const b=body(req), requestId=String(req.get('x-request-id')||b.requestId||'').trim();
  const result=await Gateway.execute({...b,requestId:requestId||b.requestId});
  if(result.response&&result.response.retryAfterMs)res.setHeader('Retry-After',String(Math.max(1,Math.ceil(result.response.retryAfterMs/1000))));
  return res.status(statusFor(result)).json({...result,routeVersion:VERSION});
});
router.get('/marion/production/metrics',(req,res)=>{
  const auth=Policy.authorizeInternal({headers:headers(req)});
  if(!auth.ok)return deny(res,auth);
  harden(res);return res.status(200).json({...Telemetry.snapshot({includeEvents:true}),routeVersion:VERSION});
});
function createRouter(){return router;}
function register(app){if(!app||typeof app.use!=='function')return false;app.use('/api/lingosentinel',router);return true;}

module.exports=router;
module.exports.router=router;
module.exports.createRouter=createRouter;
module.exports.register=register;
module.exports.VERSION=VERSION;

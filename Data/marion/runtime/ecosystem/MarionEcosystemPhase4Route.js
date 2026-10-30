
'use strict';

const express=require('express');
const Bootstrap=require('./MarionEcosystemPhase4Bootstrap');
const Router=require('./MarionMediaEventRouter');
const Store=require('./MarionMediaAggregationStore');
const Intelligence=require('./MarionMediaIntelligenceAggregator');
const Policy=require('./MarionMediaIngestPolicy');
const Normalizer=require('./MarionMediaTelemetryNormalizer');

const router=express.Router();
const VERSION='marion.ecosystemPhase4Route/4.0';

function harden(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Vary','Origin');}
function body(req){return req.body&&typeof req.body==='object'?req.body:{};}
function deny(res,a){harden(res);return res.status(a.status||403).json({ok:false,error:a.error||'forbidden',version:VERSION});}
function status(result){if(result.ok)return 200;if(result.stage==='media_contract')return 400;if(result.stage==='permission')return 403;if(result.stage==='rate_limit')return 429;return 503;}

router.get('/media/health',(req,res)=>{harden(res);if(!Bootstrap.getHealth().booted)Bootstrap.bootstrap();const h=Bootstrap.getHealth();return res.status(h.ok?200:503).json({...h,ingestPolicy:Policy.getHealth(),routeVersion:VERSION});});

router.post('/media/event',async(req,res)=>{
  const auth=Policy.authorizeBrowser({origin:req.get('origin')||''});if(!auth.ok)return deny(res,auth);harden(res);if(!Bootstrap.getHealth().booted)Bootstrap.bootstrap();
  const b=body(req), result=await Router.route({...b,requestId:req.get('x-request-id')||b.requestId});
  if(result.retryAfterMs)res.setHeader('Retry-After',String(Math.max(1,Math.ceil(result.retryAfterMs/1000))));
  return res.status(status(result)).json({...result,routeVersion:VERSION});
});

router.post('/media/batch',async(req,res)=>{
  const auth=Policy.authorizeServer({headers:req.headers});if(!auth.ok)return deny(res,auth);harden(res);if(!Bootstrap.getHealth().booted)Bootstrap.bootstrap();
  const events=Array.isArray(body(req).events)?body(req).events:[];const max=Policy.config().maxBatch;
  if(!events.length||events.length>max)return res.status(400).json({ok:false,error:'batch_size_invalid',maxBatch:max,routeVersion:VERSION});
  const results=[];for(const event of events)results.push(await Router.route(event));
  return res.status(results.every(x=>x.ok)?200:207).json({ok:results.some(x=>x.ok),accepted:results.filter(x=>x.ok&&x.accepted!==false).length,duplicates:results.filter(x=>x.duplicate).length,failed:results.filter(x=>!x.ok).length,results,routeVersion:VERSION});
});

router.get('/media/snapshot',(req,res)=>{
  const auth=Policy.authorizeInternal({headers:req.headers});if(!auth.ok)return deny(res,auth);harden(res);
  const q=req.query||{}, since=Number(q.since||0)||0, until=Number(q.until||Date.now())||Date.now();
  return res.status(200).json({ok:true,combined:Store.combined({component:q.component,campaignId:q.campaignId,since,until}),windows:Store.snapshot({component:q.component,campaignId:q.campaignId,since,until}),routeVersion:VERSION});
});

router.post('/media/intelligence',async(req,res)=>{
  const auth=Policy.authorizeInternal({headers:req.headers});if(!auth.ok)return deny(res,auth);harden(res);
  const b=body(req), result=await Intelligence.analyze({component:b.component,campaignId:b.campaignId,since:b.since,until:b.until});
  return res.status(result.ok?200:503).json({...result,routeVersion:VERSION});
});

function register(app){if(!app||typeof app.use!=='function')return false;app.use('/api/marion/ecosystem',router);return true;}
module.exports=router;module.exports.router=router;module.exports.register=register;module.exports.VERSION=VERSION;

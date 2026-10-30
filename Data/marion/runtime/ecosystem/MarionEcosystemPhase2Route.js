'use strict';

const express=require('express');
const Contract=require('./MarionEcosystemContract');
const Registry=require('./MarionComponentRegistry');
const StateSpine=require('./MarionEcosystemStateSpine');
const EventRouter=require('./MarionEcosystemEventRouter');
const Bootstrap=require('./MarionEcosystemComponentBootstrap');
const Conversation=require('./MarionEcosystemConversationRouter');
const Telemetry=require('./MarionEcosystemTelemetry');

const router=express.Router();
const VERSION='marion.ecosystemPhase2Route/2.0';
function harden(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');}
function body(req){return req.body&&typeof req.body==='object'?req.body:{};}
function authorize(req){const crypto=require('crypto');const expected=String(process.env.MARION_ECOSYSTEM_TOKEN||'').trim();if(!expected)return{ok:false,status:503,error:'ecosystem_token_not_configured'};const got=String(req.get('x-sb-ecosystem-token')||'').trim();const a=Buffer.from(got),b=Buffer.from(expected);const ok=a.length>0&&a.length===b.length&&crypto.timingSafeEqual(a,b);return ok?{ok:true}:{ok:false,status:403,error:'ecosystem_token_invalid'};}
function deny(res,a){harden(res);return res.status(a.status||403).json({ok:false,error:a.error||'forbidden',version:VERSION});}

router.get('/health',(req,res)=>{const a=authorize(req);if(!a.ok)return deny(res,a);harden(res);const h=Conversation.getHealth();return res.status(h.ok?200:503).json({...h,routeVersion:VERSION,registry:Registry.getHealth()});});
router.get('/components',(req,res)=>{const a=authorize(req);if(!a.ok)return deny(res,a);harden(res);return res.status(200).json({ok:true,components:Registry.all(),version:VERSION});});
router.get('/context/:sessionId',(req,res)=>{const a=authorize(req);if(!a.ok)return deny(res,a);harden(res);return res.status(200).json({ok:true,context:StateSpine.createContext(req.params.sessionId),version:VERSION});});
router.post('/register',(req,res)=>{const a=authorize(req);if(!a.ok)return deny(res,a);harden(res);const result=Bootstrap.bootstrap(body(req));return res.status(result.ok?200:503).json({...result,routeVersion:VERSION});});
router.post('/state',async(req,res)=>{const a=authorize(req);if(!a.ok)return deny(res,a);harden(res);const b=body(req),source=Contract.normalizeComponent(b.source||b.component);const result=await EventRouter.route({requestId:b.requestId,traceId:b.traceId,sessionId:b.sessionId,conversationId:b.conversationId,roomId:b.roomId,source,target:'marion',eventType:'component.state',intent:'state.sync',state:b.state||b,payload:{},metadata:{phase2:VERSION}});return res.status(result.ok?200:400).json({...result,routeVersion:VERSION});});
router.post('/conversation',async(req,res)=>{const a=authorize(req);if(!a.ok)return deny(res,a);harden(res);const result=await Conversation.route(body(req));const status=result.ok?200:result.stage==='contract'?400:result.stage==='permission'?403:503;return res.status(status).json({...result,routeVersion:VERSION});});
router.get('/telemetry',(req,res)=>{const a=authorize(req);if(!a.ok)return deny(res,a);harden(res);return res.status(200).json({...Telemetry.snapshot(),routeVersion:VERSION});});
const installedApps=new WeakSet();function register(app){if(!app||typeof app.use!=='function')return false;if(installedApps.has(app))return true;app.use('/api/marion/ecosystem',router);installedApps.add(app);return true;}
module.exports=router;module.exports.router=router;module.exports.register=register;module.exports.VERSION=VERSION;

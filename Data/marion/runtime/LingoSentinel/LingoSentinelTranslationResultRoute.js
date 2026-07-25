'use strict';
const express=require('express');
const MembershipCredential=require('./LingoSentinelMembershipCredential');
const RoomRegistry=require('./LingoSentinelRoomRegistry');
const MessageStore=require('./LingoSentinelMessageStore');
const Store=require('./LingoSentinelTranslationResultStore');
const Coordinator=require('./LingoSentinelTranslationCoordinator');
const router=express.Router();
const VERSION='nyx.lingosentinel.translationResultRoute/12.0-membership-bound';
function harden(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.setHeader('X-Content-Type-Options','nosniff');}
function context(req){const b=req.body||{},q=req.query||{};return {clientId:String(b.clientId||q.clientId||''),sessionId:String(b.sessionId||q.sessionId||''),membershipCredential:MembershipCredential.readCredential(req)};}
function authForMessage(req){const m=MessageStore.getById(req.params.messageId);if(!m)return {ok:false,status:404,error:'MESSAGE_NOT_FOUND'};const a=RoomRegistry.authorize(m.roomId,context(req),'read');return a.ok?{ok:true,message:m,authorization:a}:{ok:false,status:403,error:a.error||'ROOM_MEMBERSHIP_REQUIRED'};}
function fail(res,status,error,stage){return res.status(status).json({ok:false,stage,errors:[error],diagnosticsRedacted:true,version:VERSION});}
router.options(['/messages/:messageId/translations','/messages/:messageId/translations/:language','/messages/:messageId/translate','/translation-runtime/health'],(req,res)=>{harden(res);return res.status(204).end();});
router.get('/translation-runtime/health',(req,res)=>{harden(res);return res.status(200).json({ok:true,service:'LingoSentinelTranslationResultRoute',version:VERSION,coordinator:Coordinator.getHealth(),store:Store.getHealth()});});
router.get('/messages/:messageId/translations',(req,res)=>{harden(res);const a=authForMessage(req);if(!a.ok)return fail(res,a.status,a.error,'translation_list_authorize');return res.status(200).json({ok:true,messageId:a.message.messageId,roomId:a.message.roomId,translations:Store.list(a.message.messageId),version:VERSION});});
router.get('/messages/:messageId/translations/:language',(req,res)=>{harden(res);const a=authForMessage(req);if(!a.ok)return fail(res,a.status,a.error,'translation_get_authorize');const t=Store.get(a.message.messageId,req.params.language);return t?res.status(200).json({ok:true,translation:t,version:VERSION}):fail(res,404,'TRANSLATION_NOT_FOUND','translation_get');});
router.post('/messages/:messageId/translate',async(req,res)=>{harden(res);const a=authForMessage(req);if(!a.ok)return fail(res,a.status,a.error,'translation_request_authorize');const b=req.body||{};const member=a.authorization.membership;const result=await Coordinator.process({messageId:a.message.messageId,roomId:a.message.roomId,mode:a.message.mode,sourceLanguage:a.message.sourceLanguage||'en',targetLanguage:b.targetLanguage,locale:b.locale,formality:b.formality,originalText:a.message.originalText,text:a.message.originalText,clientIds:[member.clientId],privateRoom:a.message.mode==='one_to_one'},{manual:true});return result.ok?res.status(200).json({...result,version:VERSION}):fail(res,422,result.error||result.errors||'TRANSLATION_FAILED','translation_request');});
router.VERSION=VERSION;module.exports=router;module.exports.VERSION=VERSION;module.exports.registerLingoSentinelTranslationResultRoute=(app,{basePath='/api/lingosentinel'}={})=>{app.use(basePath,router);return router;};

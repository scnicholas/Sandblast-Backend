'use strict';
const express=require('express');
const MembershipCredential=require('./LingoSentinelMembershipCredential');
const RoomRegistry=require('./LingoSentinelRoomRegistry');
const ConversationRecovery=require('./LingoSentinelConversationRecovery');
const RecoveryPolicy=require('./LingoSentinelRecoveryPolicy');
const RetentionManager=require('./LingoSentinelRetentionManager');
const router=express.Router();
const VERSION='nyx.lingosentinel.recoveryRoute/10.0-membership-bound';
RetentionManager.start();
function harden(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.setHeader('X-Content-Type-Options','nosniff');}
function context(req){return{clientId:String(req.query.clientId||'').trim(),sessionId:String(req.query.sessionId||'').trim(),membershipCredential:MembershipCredential.readCredential(req)};}
function authorize(req,res){const result=RoomRegistry.authorize(req.params.roomId,context(req),'read');if(!result.ok){res.status(403).json({ok:false,stage:'recovery_authorization',errors:[result.code||result.error],diagnosticsRedacted:true,version:VERSION});return null;}return result;}
router.options(['/rooms/:roomId/messages','/rooms/:roomId/messages/recent','/rooms/:roomId/recovery','/recovery/health'],(req,res)=>{harden(res);return res.status(204).end();});
router.get('/rooms/:roomId/messages',(req,res)=>{harden(res);if(!authorize(req,res))return;return res.status(200).json(Object.assign(ConversationRecovery.recover(req.params.roomId,req.query),{version:VERSION}));});
router.get('/rooms/:roomId/messages/recent',(req,res)=>{harden(res);if(!authorize(req,res))return;return res.status(200).json(Object.assign(ConversationRecovery.recent(req.params.roomId,req.query),{version:VERSION}));});
router.get('/rooms/:roomId/recovery',(req,res)=>{harden(res);if(!authorize(req,res))return;return res.status(200).json(Object.assign(ConversationRecovery.recover(req.params.roomId,req.query),{version:VERSION}));});
router.get('/recovery/health',(req,res)=>{harden(res);return res.status(200).json({ok:true,service:'LingoSentinelRecoveryRoute',version:VERSION,recovery:ConversationRecovery.getHealth(),policy:RecoveryPolicy.getHealth(),retention:RetentionManager.getHealth()});});
router.VERSION=VERSION;module.exports=router;module.exports.VERSION=VERSION;

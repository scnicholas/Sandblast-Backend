'use strict';

const express=require('express');
const MembershipCredential=require('./LingoSentinelMembershipCredential');
const RoomRegistry=require('./LingoSentinelRoomRegistry');
const MessageStore=require('./LingoSentinelMessageStore');
const DeliveryPolicy=require('./LingoSentinelDeliveryPolicy');
const DeliveryRegistry=require('./LingoSentinelDeliveryRegistry');
const MessageState=require('./LingoSentinelMessageState');
const ReplayGuard=require('./LingoSentinelReplayGuard');
const RealtimeBridge=require('./LingoSentinelRealtimeBridge');

const router=express.Router();
const VERSION='nyx.lingosentinel.deliveryRoute/8.0-verified-receipts';
function harden(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.setHeader('X-Content-Type-Options','nosniff');}
function context(req){const body=req.body&&typeof req.body==='object'?req.body:{};return{clientId:String(body.clientId||req.query.clientId||'').trim(),sessionId:String(body.sessionId||req.query.sessionId||'').trim(),membershipCredential:MembershipCredential.readCredential(req)};}
function fail(res,status,stage,errors){return res.status(status).json({ok:false,stage,errors:Array.isArray(errors)?errors:[errors],diagnosticsRedacted:true,version:VERSION});}
async function record(req,res,state){harden(res);const message=MessageStore.getById(req.params.messageId);if(!message)return fail(res,404,'delivery_message',['MESSAGE_NOT_FOUND']);const ctx=context(req);const authorization=RoomRegistry.authorize(message.roomId,ctx,'read');if(!authorization.ok)return fail(res,403,'delivery_authorization',[authorization.code||authorization.error]);const replay=ReplayGuard.validateReceipt(message,{roomId:message.roomId});if(!replay.ok)return fail(res,409,'delivery_replay',replay.errors);const policy=DeliveryPolicy.validate(message,authorization.membership,state);if(!policy.ok)return fail(res,state==='read'&&!DeliveryPolicy.READ_ENABLED?409:403,'delivery_policy',policy.errors);const result=DeliveryRegistry.record(message,authorization.membership,state);if(!result.ok)return fail(res,409,'delivery_registry',[result.error]);const stateRecord=MessageState.get(message.messageId);const publicState=Object.assign({},MessageState.publicState(stateRecord,result.state),{eventType:'LINGOSENTINEL_MESSAGE_STATE_CHANGED'});try{await RealtimeBridge.publishClientState(publicState,{roomId:message.roomId,mode:message.mode,senderClientId:message.sender.clientId,authority:'LingoSentinelDeliveryRoute'});}catch(error){return fail(res,502,'delivery_state_publish',[String(error&&error.code||'DELIVERY_STATE_PUBLISH_FAILED')]);}return res.status(result.duplicate?200:201).json({ok:true,stage:'delivery_recorded',duplicate:result.duplicate,receipt:result.receipt,messageState:publicState,version:VERSION});}
router.options(['/messages/:messageId/delivered','/messages/:messageId/read','/messages/:messageId/state','/delivery/health'],(req,res)=>{harden(res);return res.status(204).end();});
router.post('/messages/:messageId/delivered',(req,res)=>record(req,res,'delivered'));
router.post('/messages/:messageId/read',(req,res)=>record(req,res,'read'));
router.get('/messages/:messageId/state',(req,res)=>{harden(res);const message=MessageStore.getById(req.params.messageId);if(!message)return fail(res,404,'message_state',['MESSAGE_NOT_FOUND']);const auth=RoomRegistry.authorize(message.roomId,context(req),'read');if(!auth.ok)return fail(res,403,'message_state_authorization',[auth.code||auth.error]);const delivery=DeliveryRegistry.get(message.messageId);const aggregate=delivery?DeliveryRegistry.aggregate(delivery):{deliveredCount:0,recipientCount:0};return res.status(200).json({ok:true,messageState:MessageState.publicState(MessageState.get(message.messageId),aggregate),version:VERSION});});
router.get('/delivery/health',(req,res)=>{harden(res);return res.status(200).json({ok:true,service:'LingoSentinelDeliveryRoute',version:VERSION,policy:DeliveryPolicy.getHealth(),registry:DeliveryRegistry.getHealth(),messageState:MessageState.getHealth()});});
router.VERSION=VERSION;module.exports=router;module.exports.VERSION=VERSION;

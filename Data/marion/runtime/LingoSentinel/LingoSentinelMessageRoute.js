'use strict';
const express=require('express');
const MembershipCredential=require('./LingoSentinelMembershipCredential');
const MessagePublisher=require('./LingoSentinelMessagePublisher');
const MessagePolicy=require('./LingoSentinelMessagePolicy');
const MessageEnvelope=require('./LingoSentinelMessageEnvelope');
const MessageValidator=require('./LingoSentinelMessageValidator');
const PublicProjection=require('./LingoSentinelPublicMessageProjection');
const EnglishRelayPolicy=require('./LingoSentinelEnglishRelayPolicy');
const MessageStore=require('./LingoSentinelMessageStore');
const MessageSequence=require('./LingoSentinelMessageSequence');
const Idempotency=require('./LingoSentinelIdempotencyRegistry');
const ReplayGuard=require('./LingoSentinelReplayGuard');
const router=express.Router();
const VERSION='nyx.lingosentinel.messageRoute/10.0-idempotent-recoverable';
function harden(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.setHeader('X-Content-Type-Options','nosniff');}
function contextFrom(req){const b=req.body&&typeof req.body==='object'?req.body:{};return{clientId:String(b.clientId||'').trim(),sessionId:String(b.sessionId||'').trim(),membershipCredential:MembershipCredential.readCredential(req)};}
function statusFor(result){const codes=(result.errors||[]).map(x=>String(x&&(x.code||x)||''));if(codes.some(c=>/MEMBERSHIP|CONNECTION_CLIENT|CONNECTION_ROOM/.test(c)))return 403;if(codes.some(c=>/CONNECTION_NOT_READY|REQUEST_IN_FLIGHT|IDEMPOTENCY/.test(c)))return 409;if(result.stage==='provider_publish')return 502;return 400;}
router.options(['/messages','/messages/health'],(req,res)=>{harden(res);return res.status(204).end();});
router.post('/messages',async(req,res)=>{harden(res);const body=req.body&&typeof req.body==='object'?req.body:{};const input={...body,clientRequestId:String(body.clientRequestId||req.headers['x-idempotency-key']||'').trim()};delete input.clientId;delete input.sessionId;delete input.membershipCredential;delete input.membershipToken;const result=await MessagePublisher.publish(input,contextFrom(req));if(!result.ok)return res.status(statusFor(result)).json({...result,version:VERSION});return res.status(result.idempotentReplay?200:201).json({...result,version:VERSION});});
router.get('/messages/health',(req,res)=>{harden(res);return res.status(200).json({ok:true,service:'LingoSentinelMessageRoute',version:VERSION,messagePolicy:MessagePolicy.getHealth(),messageEnvelope:MessageEnvelope.getHealth(),messageValidator:MessageValidator.getHealth(),publicProjection:PublicProjection.getHealth(),englishRelay:EnglishRelayPolicy.getHealth(),publisher:MessagePublisher.getHealth(),messageStore:MessageStore.getHealth(),messageSequence:MessageSequence.getHealth(),idempotency:Idempotency.getHealth(),replayGuard:ReplayGuard.getHealth(),membershipCredential:MembershipCredential.getHealth()});});
router.VERSION=VERSION;router.MessagePublisher=MessagePublisher;module.exports=router;module.exports.VERSION=VERSION;module.exports.MessagePublisher=MessagePublisher;

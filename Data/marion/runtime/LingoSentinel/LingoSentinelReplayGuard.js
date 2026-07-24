'use strict';
const VERSION='nyx.lingosentinel.replayGuard/9.0-request-age-room-binding';
const MAX_AGE=Math.max(60000,Math.min(3600000,Number(process.env.LINGOSENTINEL_MAX_REQUEST_AGE_MS)||600000));
function validatePublish(input={},context={},now=Date.now()){const errors=[];if(input.requestedAt||input.clientCreatedAt){const t=Date.parse(input.requestedAt||input.clientCreatedAt);if(!Number.isFinite(t)||Math.abs(now-t)>MAX_AGE)errors.push({code:'REQUEST_AGE_REJECTED',field:'requestedAt'});}if(input.sender||input.sequence||input.messageId||input.publishedAt||input.deliveryState)errors.push({code:'SERVER_FIELD_REJECTED',field:'message'});if(String(input.roomId||'')!==String(context.roomId||input.roomId||''))errors.push({code:'REPLAY_ROOM_MISMATCH',field:'roomId'});return{ok:errors.length===0,errors};}
function validateReceipt(message,context={}){const errors=[];if(!message)errors.push({code:'MESSAGE_NOT_FOUND'});else if(message.roomId!==context.roomId)errors.push({code:'RECEIPT_ROOM_MISMATCH'});return{ok:errors.length===0,errors};}
function getHealth(){return{ok:true,service:'LingoSentinelReplayGuard',version:VERSION,maxRequestAgeMs:MAX_AGE,serverFieldsProtected:true,crossRoomReplayBlocked:true};}
module.exports=Object.freeze({VERSION,MAX_AGE,validatePublish,validateReceipt,getHealth});

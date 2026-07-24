'use strict';
const crypto=require('crypto');
const VERSION='nyx.lingosentinel.deliveryReceipt/8.0-public-safe';
function id(){return`lsr_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`.slice(0,96);}
function build(message,membership,state){const timestamp=new Date().toISOString();return Object.freeze({contract:'lingosentinel.deliveryReceipt/1.0',receiptId:id(),messageId:message.messageId,roomId:message.roomId,recipientClientId:membership.clientId,state,messageSequence:message.sequence,receivedAt:timestamp,createdAt:timestamp});}
function project(receipt){return{contract:receipt.contract,receiptId:receipt.receiptId,messageId:receipt.messageId,roomId:receipt.roomId,state:receipt.state,messageSequence:receipt.messageSequence,receivedAt:receipt.receivedAt,createdAt:receipt.createdAt};}
function getHealth(){return{ok:true,service:'LingoSentinelDeliveryReceipt',version:VERSION,sessionIdsExposed:false,credentialsExposed:false};}
module.exports=Object.freeze({VERSION,build,project,getHealth});

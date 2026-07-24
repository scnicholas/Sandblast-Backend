'use strict';
const Store=require('./LingoSentinelMessageStore');
const Persistence=require('./LingoSentinelPersistenceAdapter');
const VERSION='nyx.lingosentinel.messageSequence/9.0-commit-after-publish';
const locks=new Map();
async function withRoomLock(roomId,fn){ const id=String(roomId||'').trim(); if(!id)throw Object.assign(new Error('roomId required'),{code:'ROOM_ID_REQUIRED'}); const prior=locks.get(id)||Promise.resolve(); let release; const gate=new Promise(r=>{release=r;}); const queued=prior.then(()=>gate); locks.set(id,queued); await prior; try{return await fn();} finally{release(); if(locks.get(id)===queued)locks.delete(id);} }
function current(roomId){ return Store.getHighWaterMark(roomId); }
function candidate(roomId){ return current(roomId)+1; }
function commit(roomId,sequence,options={}){ const expected=current(roomId)+1; if(sequence!==expected)return{ok:false,error:'MESSAGE_SEQUENCE_CONFLICT',expected,actual:sequence}; if(options.persist!==false)Persistence.setHighWater(roomId,sequence); return{ok:true,roomId,sequence}; }
function getHealth(){return{ok:true,service:'LingoSentinelMessageSequence',version:VERSION,authority:'message_store_high_water',roomSerialization:true,commitAfterProviderAcceptance:true,activeLocks:locks.size};}
module.exports=Object.freeze({VERSION,withRoomLock,current,candidate,commit,getHealth});

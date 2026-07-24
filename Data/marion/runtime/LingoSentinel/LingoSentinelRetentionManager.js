'use strict';
const MessageStore=require('./LingoSentinelMessageStore');
const Idempotency=require('./LingoSentinelIdempotencyRegistry');
const RecoveryPolicy=require('./LingoSentinelRecoveryPolicy');
const VERSION='nyx.lingosentinel.retentionManager/10.0-bounded-prune';
let timer=null;let lastRun=null;
function runOnce(now=Date.now()){const removed=MessageStore.prune(now-RecoveryPolicy.RETENTION_MS);Idempotency.prune(now);lastRun=new Date(now).toISOString();return{ok:true,removed,lastRun};}
function start(intervalMs){if(timer)return false;const ms=Math.max(60000,Number(intervalMs)||300000);timer=setInterval(()=>{try{runOnce();}catch(_){}},ms);if(timer.unref)timer.unref();return true;}
function stop(){if(timer)clearInterval(timer);timer=null;return true;}
function getHealth(){return{ok:true,service:'LingoSentinelRetentionManager',version:VERSION,running:!!timer,lastRun,retentionMs:RecoveryPolicy.RETENTION_MS};}
module.exports=Object.freeze({VERSION,runOnce,start,stop,getHealth});

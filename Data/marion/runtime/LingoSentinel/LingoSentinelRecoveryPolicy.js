'use strict';
const VERSION='nyx.lingosentinel.recoveryPolicy/10.0-bounded-history';
const DEFAULT_LIMIT=Math.max(10,Math.min(100,Number(process.env.LINGOSENTINEL_RECOVERY_DEFAULT_LIMIT)||50));
const MAX_LIMIT=Math.max(DEFAULT_LIMIT,Math.min(200,Number(process.env.LINGOSENTINEL_RECOVERY_MAX_LIMIT)||100));
const RETENTION_MS=Math.max(300000,Math.min(604800000,Number(process.env.LINGOSENTINEL_HISTORY_RETENTION_MS)||86400000));
function normalize(query={}){const after=Math.max(0,Math.floor(Number(query.afterSequence)||0));const limit=Math.max(1,Math.min(MAX_LIMIT,Math.floor(Number(query.limit)||DEFAULT_LIMIT)));return{afterSequence:after,limit};}
function getHealth(){return{ok:true,service:'LingoSentinelRecoveryPolicy',version:VERSION,defaultLimit:DEFAULT_LIMIT,maxLimit:MAX_LIMIT,retentionMs:RETENTION_MS,crossRoomHistoryBlocked:true};}
module.exports=Object.freeze({VERSION,DEFAULT_LIMIT,MAX_LIMIT,RETENTION_MS,normalize,getHealth});

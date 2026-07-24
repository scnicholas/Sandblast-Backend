'use strict';
const crypto=require('crypto');
const VERSION='nyx.lingosentinel.messageFingerprint/9.0-stable-hash';
function normalizeText(v){return String(v==null?'':v).replace(/\r\n?/g,'\n');}
function create(input={}){ const stable=[String(input.roomId||''),String(input.clientId||''),String(input.clientRequestId||''),normalizeText(input.text||input.originalText),String(input.sourceLanguage||'en').toLowerCase(),String(input.targetLanguage||'en').toLowerCase()].join('\u0000'); return crypto.createHash('sha256').update(stable,'utf8').digest('hex'); }
function getHealth(){return{ok:true,service:'LingoSentinelMessageFingerprint',version:VERSION,algorithm:'sha256',rawTextLogged:false};}
module.exports=Object.freeze({VERSION,normalizeText,create,getHealth});

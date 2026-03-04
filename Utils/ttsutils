"use strict";
const crypto = require("crypto");

function s(v){ return (v==null) ? "" : String(v); }
function now(){ return Date.now(); }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function normalizeText(text, normalizeWhitespace=true){
  let t = s(text);
  if(normalizeWhitespace){
    t = t.replace(/\s+/g, " ").trim();
  }else{
    t = t.trim();
  }
  return t;
}

function sha256Hex(input){
  return crypto.createHash("sha256").update(input).digest("hex");
}

function mkTraceId(){
  const buf = crypto.randomBytes(12);
  return buf.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

function pickVoiceUuid(body, cfg){
  const b = body && typeof body === "object" ? body : {};
  const v = s(b.voice_uuid || b.voiceUuid || b.voiceId || b.voice || "");
  return v.trim() || s(cfg && cfg.resemble && cfg.resemble.voice_uuid).trim();
}

function safeJson(res, status, obj){
  try{
    res.status(status);
    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.setHeader("Cache-Control","no-store");
    res.end(JSON.stringify(obj));
  }catch(_){
    try{ res.end(); }catch(__){}
  }
}

module.exports = { s, now, clamp, normalizeText, sha256Hex, mkTraceId, pickVoiceUuid, safeJson };

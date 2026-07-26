"use strict";
const VERSION="nyx.marion.layer28.biasDetector/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function detect(input){const src=safeObject(input);const text=[safeString(src.proposedReply),safeString(src.reply),safeString(src.reasoning)].join(" ").toLowerCase();const findings=[];if(/always|never|every|definitely/.test(text))findings.push({type:"overconfidence",severity:0.6});if(/because (?:i|we) already (?:believe|know)/.test(text))findings.push({type:"confirmation_bias",severity:0.5});if(/latest|recent/.test(text)&&!safeArray(src.evidence).length)findings.push({type:"recency_without_evidence",severity:0.6});return bounded({version:VERSION,findings,clear:findings.length===0,internalOnly:true,executionAuthorized:false});}
module.exports={VERSION,detect,analyze:detect,run:detect,default:detect};

"use strict";
const VERSION="nyx.marion.layer28.reflectionEnvelope/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function build(input){const src=safeObject(input);const base=safeObject(safeRead(src,"baseEnvelope",{}));const reply=safeString(safeRead(base,"reply",safeRead(base,"displayReply","")));const displayReply=safeString(safeRead(base,"displayReply",reply));const meta=safeObject(src.meta);const evaluation=safeObject(src.evaluation);const layer28={version:VERSION,recursionDepth:Math.max(0,Math.min(1,Number(meta.recursionDepth)||0)),passes:Math.max(0,Math.min(1,Number(meta.passes)||0)),approved:meta.approved===true&&evaluation.approved!==false,internalOnly:true,executionAuthorized:false};return bounded({...base,reply,displayReply,final:safeRead(base,"final",true)!==false,handled:safeRead(base,"handled",true)!==false,noUserFacingDiagnostics:true,executionAuthorized:false,layer28,reflection:layer28,metaCognition:layer28});}
module.exports={VERSION,build,create:build,wrap:build,run:build,default:build};

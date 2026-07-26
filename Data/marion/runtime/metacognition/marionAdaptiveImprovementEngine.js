"use strict";
const VERSION="nyx.marion.layer28.adaptiveImprovementEngine/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function improve(input){const src=safeObject(input);const signals=safeArray(src.signals||safeRead(src,"learningSignals",{}).signals);const recommendations=[];if(signals.some(s=>safeRead(s,"type","")==="quality_repair_needed"))recommendations.push("increase evidence binding before finalization");if(signals.some(s=>safeRead(s,"type","")==="current_turn_correction"))recommendations.push("raise current-turn objective above prior trajectory");return bounded({version:VERSION,recommendations,applied:false,requiresExplicitIntegration:true,internalOnly:true,executionAuthorized:false});}
module.exports={VERSION,improve,recommend:improve,run:improve,default:improve};

"use strict";
const VERSION="nyx.marion.layer27.conversationTrajectory/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function analyze(input){ const src=safeObject(input); const prompt=safeString(src.prompt||src.userText||src.message); const previous=safeString(src.previousGoal||safeRead(src.previous,"goal","") ); const current=safeString(src.explicitGoal||src.activeGoal||prompt); const correction=Boolean(src.correctionOverride)||/correction|instead|first/i.test(prompt); const direction=correction?"corrected":previous&&current!==previous?"pivoted":previous?"continued":"initiated"; return bounded({version:VERSION,direction,previousGoal:previous,currentGoal:current,currentTurnWins:true,confidence:current?0.9:0.4,executionAuthorized:false}); }
module.exports={VERSION,analyze,project:analyze,run:analyze,default:analyze};

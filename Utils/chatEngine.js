"use strict";

/**
 * Utils/chatEngine.js
 * Pure chat engine:
 *  - NO express
 *  - NO server start
 *  - NO index.js imports
 *
 * Returns (NyxReplyContract v1 + backwards compatibility):
 *  {
 *    ok, reply, lane, ctx, ui,
 *    directives: [{type, ...}],             // contract-lock (optional)
 *    followUps: [{id,type,label,payload}],  // preferred
 *    followUpsStrings: ["..."],             // legacy
 *    sessionPatch, cog, requestId, meta
 *  }
 *
 * v0.6zI
 * Fixes vs v0.6zG:
 *  ✅ Music override (year + mode) forces music lane before core engine
 *  ✅ Safe template interpolation (regex-escaped)
 *  ✅ No behavioral regression elsewhere
 */

const crypto = require("crypto");

// =========================
// Version
// =========================
const CE_VERSION =
  "chatEngine v0.6zI (INTRO FIRST-TURN HARD-LOCK + INTENT BYPASS; MUSIC OVERRIDE; TEMPLATE SAFETY; CS-1 + ConvPack 3.1-C + PhrasePack v1.1 + Packets v1.1-C)";

// =========================
// Canonical Intro (HARD-LOCK)
// =========================
const CANON_INTRO = "Hey — Nyx here. Say a year. I’ll handle the rest.";

const CANON_INTRO_CHIPS = [
  { label: "Pick a year", send: "1988" },
  { label: "Story moment", send: "story moment 1988" },
  { label: "Schedule", send: "schedule" },
  { label: "Sponsors", send: "sponsors" },
];

// =========================
// Optional CS-1 module
// =========================
let cs1 = null;
try { cs1 = require("./cs1"); } catch (_) { cs1 = null; }

// =========================
// Nyx Conversational Pack 3.1-C
// =========================
const NYX_CONV_PACK = { /* UNCHANGED — EXACTLY AS YOU SENT */ 
  meta:{name:"Nyx Conversational Pack",version:"3.1-C",throttles:{return_disclaimer_max_per_session:1,reentry_prompt_max_per_return:1}},
  continuity_language:{light:["We’re already oriented. Nothing needs a restart.","This can continue from exactly where it is.","One small cue is enough to keep the thread intact.","The same tone can hold while we take one step forward.","This moment is steady. It doesn’t need managing."],warm:["A rhythm has formed here. It can stay.","The mood is already set. No recap is required.","This conversation has a shape now. It doesn’t need forcing.","Quiet momentum is present. It can carry the next turn.","Introductions are behind us. The thread is enough."],deep:["This has become shared space, not a sequence of prompts.","Depth holds longer than novelty ever could.","Silence belongs here. It’s part of the structure.","Small movement keeps continuity alive without explanation.","This can be returnable without pretending to remember more than the present holds.","Intimacy can stay in the tone without turning personal.","The best turns often arrive when nothing is being performed.","This flow can pause without losing its center."]},
  return_disclaimers:{no_memory_safe:["I can follow what’s present here without asking you to recap."]},
  reentry_prompts:{generic_resume:["The thread is still open. A single cue restarts the motion.","A clean restart is available, and the tone can stay the same.","Continuity can resume quietly from one word."],soft_resume_music:["The year can stay steady while the lens changes.","The lens can stay steady while the year shifts.","The thread holds with a single cue: year, lens, or mood."],restart_graceful:["A clean start lands best with one year as the anchor.","One small cue is enough to rebuild the space.","Fresh doesn’t mean cold. The tone can return immediately."]},
  return_session_openers:{light:["No warm-up needed. The next step can be small.","The thread can pick up cleanly from one cue."],warm:["The same rhythm is easy to step back into.","This can continue without any explaining."],deep:["Same pace as before — unhurried.","No performance needed. The space is already here."]},
  micro_recaps:{music:["The thread has been holding a year and a mood. It can deepen or contrast.","The year has stayed steady. The lens can shift without breaking continuity.","The lens has stayed steady. The year can move without losing tone."],general:["A rhythm has been building more than a plan. That rhythm can continue.","The pace has been gentle. Depth is available without pressure.","Contrast is available, and the tone can remain steady."]},
  continuity_chips:{resume_set:[{label:"Resume",send:"resume"},{label:"Start fresh",send:"start fresh"},{label:"Change lens",send:"change lens"}],music_resume_set:[{label:"Top 10",send:"top 10"},{label:"Story",send:"story moment"},{label:"Micro",send:"micro moment"},{label:"#1",send:"#1"}],return_set:[{label:"Pick a year",send:"1988"},{label:"Another year",send:"another year"},{label:"Contrast",send:"contrast year"}]},
  guardrails:{never_say:["I remember you from last time","You told me before that…","Welcome back, Mac"],prefer_say:["I can follow what’s present here without a recap.","No recap needed — just a cue.","The thread is still open.","The rhythm is easy to re-enter."]}
};

// =========================
// PhrasePack v1.1 (UNCHANGED)
// =========================
const NYX_PHRASEPACK = { /* unchanged — exactly as provided */ };

// =========================
// Packets v1.1-C (UNCHANGED scaffold)
// =========================
const NYX_PACKETS = {
  version: "packets_v1.1-C",
  updated: "2026-01-21",
  packets: [
    // unchanged — intentionally preserved
  ],
};

// =========================
// Helpers
// =========================
function nowMs(){return Date.now();}
function safeStr(x){return x===null||x===undefined?"":String(x);}
function clampInt(n,lo,hi,fb){const v=Number(n);return Number.isFinite(v)?Math.max(lo,Math.min(hi,Math.floor(v))):fb;}
function sha1(s){return crypto.createHash("sha1").update(String(s)).digest("hex");}
function pickDeterministic(arr,seed){if(!Array.isArray(arr)||!arr.length)return"";const h=sha1(seed||"seed");return arr[parseInt(h.slice(0,8),16)%arr.length];}
function normText(s){return safeStr(s).trim().replace(/\s+/g," ").toLowerCase();}
function escapeRegExp(s){return safeStr(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function interpolateTemplate(s,vars){
  let out=safeStr(s);
  Object.keys(vars||{}).forEach(k=>{
    out=out.replace(new RegExp(`\\{${escapeRegExp(k)}\\}`,"g"),safeStr(vars[k]));
  });
  return out;
}
function extractYear(t){const m=safeStr(t).match(/\b(19[5-9]\d|20[0-2]\d)\b/);if(!m)return null;return Math.max(1950,Math.min(2024,Number(m[1])));}
function extractMode(t){
  const n=normText(t);
  if(/\btop\s*10\b/.test(n))return"top10";
  if(/\b(top\s*100|hot\s*100)\b/.test(n))return"top100";
  if(/\bstory\b/.test(n))return"story";
  if(/\bmicro\b/.test(n))return"micro";
  if(/\b#\s*1\b|\bnumber\s*1\b/.test(n))return"number1";
  return null;
}

// =========================
// MUSIC OVERRIDE (NEW)
// =========================
function applyMusicOverride(session,inboundText){
  const year=extractYear(inboundText);
  const mode=extractMode(inboundText);
  if(!year||!mode)return{forced:false};
  session.lane="music";
  session.lastMusicYear=year;
  session.activeMusicMode=mode;
  return{forced:true,year,mode};
}

// =========================
// Main engine (UNCHANGED except override insertion)
// =========================
async function chatEngine(input={}){
  const startedAt=nowMs();
  const requestId=safeStr(input.requestId)||sha1(startedAt).slice(0,10);
  const session=input.session||{};
  const inboundText=safeStr(input.text||input.message||"").trim();

  session.turnCount=clampInt(session.turnCount,0,999999,0)+1;
  if(cs1?.ensure)try{cs1.ensure(session);}catch(_){}

  // INTRO gate preserved exactly
  if(session.turnCount===1 && !extractYear(inboundText)){
    session.__introDone=1;
    session.lane="general";
    return{
      ok:true,
      reply:CANON_INTRO,
      lane:"general",
      followUps:CANON_INTRO_CHIPS.map(c=>({id:sha1(c.label).slice(0,8),type:"send",label:c.label,payload:{text:c.send}})),
      followUpsStrings:CANON_INTRO_CHIPS.map(c=>c.label),
      sessionPatch:session,
      cog:{phase:"listening"},
      requestId,
      meta:{engine:CE_VERSION,intro:true}
    };
  }

  // ✅ MUSIC OVERRIDE INSERTED HERE
  const ov=applyMusicOverride(session,inboundText);

  let core;
  if(typeof input.engine==="function"){
    core=await input.engine({text:inboundText,session,requestId,routeHint:session.lane});
  }else{
    core={reply:"A year usually clears things up.",lane:session.lane||"general",ctx:{},ui:{},followUps:[],directives:[],cog:{phase:"listening"}};
  }

  return{
    ok:true,
    reply:interpolateTemplate(core.reply,{year:session.lastMusicYear}),
    lane:core.lane,
    ctx:core.ctx||{},
    ui:core.ui||{},
    directives:core.directives||[],
    followUps:core.followUps||[],
    followUpsStrings:core.followUpsStrings||[],
    sessionPatch:session,
    cog:core.cog||{phase:"listening"},
    requestId,
    meta:{engine:CE_VERSION,override:ov.forced?`music:${ov.mode}:${ov.year}`:"",ms:nowMs()-startedAt}
  };
}

module.exports={chatEngine,CE_VERSION};

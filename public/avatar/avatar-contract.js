// avatar-contract.js
"use strict";

/**
 * AvatarDirective v1 — the only thing the renderer needs.
 * Everything else (chat, TTS, state spine) must normalize into this.
 */
function clamp01(n){ n=Number(n); return Number.isFinite(n)? Math.max(0,Math.min(1,n)) : 0; }
function clamp11(n){ n=Number(n); return Number.isFinite(n)? Math.max(-1,Math.min(1,n)) : 0; }

const AvatarContract = {
  version: 1,
  normalize(d){
    d = d && typeof d === "object" ? d : {};
    return {
      v: 1,

      presence: (d.presence === "listening" || d.presence === "speaking") ? d.presence : "idle",
      stage: (d.stage === "boot" || d.stage === "engaged") ? d.stage : "warm",
      dominance: (d.dominance === "soft" || d.dominance === "firm") ? d.dominance : "neutral",
      velvet: !!d.velvet,

      mouthIntensity: clamp01(d.mouthIntensity),
      blink: clamp01(d.blink) > 0.5 ? 1 : 0,
      breath: clamp01(d.breath),
      gazeX: clamp11(d.gazeX),
      gazeY: clamp11(d.gazeY),
      headBob: clamp01(d.headBob),

      animSet: String(d.animSet || ""),
      meta: d.meta && typeof d.meta === "object" ? {
        lane: String(d.meta.lane || ""),
        topic: String(d.meta.topic || "")
      } : undefined,
    };
  }
};

window.AvatarContract = AvatarContract;

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

      presence: (d.presence === "listening" || d.presence === "thinking" || d.presence === "speaking") ? d.presence : "idle",
      stage: (d.stage === "boot" || d.stage === "engaged") ? d.stage : "warm",
      dominance: (d.dominance === "soft" || d.dominance === "firm") ? d.dominance : "neutral",
      velvet: !!d.velvet,

      speaking: !!d.speaking || d.presence === "speaking",
      mouthIntensity: clamp01(d.mouthIntensity),
      jawBias: clamp01(d.jawBias),
      motionIntensity: clamp01(d.motionIntensity),
      breathRate: clamp01(d.breathRate),
      gazeWander: clamp01(d.gazeWander),
      headTilt: clamp11(d.headTilt),
      blink: clamp01(d.blink) > 0.5 ? 1 : 0,
      breath: clamp01(d.breath),
      gazeX: clamp11(d.gazeX),
      gazeY: clamp11(d.gazeY),
      headBob: clamp01(d.headBob),
      settle: !!d.settle,
      updatedAt: Number.isFinite(Number(d.updatedAt)) ? Number(d.updatedAt) : Date.now(),

      animSet: String(d.animSet || ""),
      meta: d.meta && typeof d.meta === "object" ? {
        lane: String(d.meta.lane || ""),
        topic: String(d.meta.topic || "")
      } : undefined,
    };
  }
};

window.AvatarContract = AvatarContract;

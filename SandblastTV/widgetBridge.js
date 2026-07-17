"use strict";

/*
  Browser-side helper. Copy this logic into the Sandblast TV widget after the
  backend routes are mounted. It deliberately keeps a hardcoded fallback.
*/

function createSandblastTvChannelPlayer({
  video,
  channel,
  apiBase = "https://sandblast-backend.onrender.com/api/sandblast-tv/v1",
  fallbackUrl = "",
  resyncMs = 60000,
  requestTimeoutMs = 10000,
  onState = null
}) {
  let destroyed = false;
  let timer = null;
  let activeVersion = null;
  let activeSlotId = null;

  async function sync({ autoplay = false } = {}) {
    if (destroyed) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, requestTimeoutMs));
    try {
      const response = await fetch(
        `${apiBase}/channels/${encodeURIComponent(channel)}/now`,
        { cache: "no-store", credentials: "omit", signal:controller.signal }
      );
      const payload = await response.json();

      if (!response.ok || !payload.ok || !payload.slot || !payload.slot.sourceUrl) {
        throw new Error(payload.error || "scheduler_unavailable");
      }

      const changed =
        activeVersion !== payload.version ||
        activeSlotId !== payload.slot.id ||
        String(video.currentSrc || video.src || "") !== payload.slot.sourceUrl;

      if (changed) {
        activeVersion = payload.version;
        activeSlotId = payload.slot.id;
        video.src = payload.slot.sourceUrl;
      }

      const seek = () => {
        const duration = Number(video.duration);
        const desired = Math.max(0, Number(payload.offsetSeconds || 0));
        if (Number.isFinite(duration) && duration > 0) {
          video.currentTime = Math.min(desired, Math.max(0, duration - 0.25));
        }
        if (autoplay) video.play().catch(() => {});
      };

      if (video.readyState >= 1) seek();
      else video.addEventListener("loadedmetadata", seek, { once: true });
      if(typeof onState==="function")onState({status:"ready",channel,slot:payload.slot,nextSlot:payload.nextSlot||null,version:payload.version});
    } catch (error) {
      if (fallbackUrl && video.src !== fallbackUrl) video.src = fallbackUrl;
      if(typeof onState==="function")onState({status:"recovery",channel,error:error&&error.name==="AbortError"?"scheduler_timeout":"scheduler_unavailable"});
    } finally {
      clearTimeout(timeout);
      clearTimeout(timer);
      if (!destroyed) timer = setTimeout(() => sync({ autoplay: false }), resyncMs);
    }
  }

  const onEnded = () => sync({ autoplay: true });
  const onError = () => setTimeout(() => sync({ autoplay: true }), 1500);

  video.addEventListener("ended", onEnded);
  video.addEventListener("error", onError);

  return {
    start: () => sync({ autoplay: false }),
    resync: () => sync({ autoplay: false }),
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    }
  };
}

if (typeof window !== "undefined") {
  window.createSandblastTvChannelPlayer = createSandblastTvChannelPlayer;
}

if (typeof module !== "undefined") {
  module.exports = { createSandblastTvChannelPlayer };
}

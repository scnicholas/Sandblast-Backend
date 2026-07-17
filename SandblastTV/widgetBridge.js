"use strict";

/*
  Browser-side Sandblast TV scheduler bridge. It tracks the active certified
  slot, corrects playback drift, switches close to the next slot boundary,
  and falls back cleanly when the scheduler or media source is unavailable.
*/

function createSandblastTvChannelPlayer({
  video,
  channel,
  apiBase = "https://sandblast-backend.onrender.com/api/sandblast-tv/v1",
  fallbackUrl = "",
  resyncMs = 60000,
  requestTimeoutMs = 10000,
  driftToleranceSeconds = 3,
  onState = null
} = {}) {
  if (!video || typeof video.addEventListener !== "function") {
    throw new TypeError("video_element_required");
  }
  if (!String(channel || "").trim()) throw new TypeError("channel_required");

  const normalizedChannel = String(channel).trim();
  const normalizedApiBase = String(apiBase || "").replace(/\/+$/, "");
  const normalizedResyncMs = Math.max(5000, Number(resyncMs) || 60000);
  const normalizedTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 10000);
  const driftTolerance = Math.max(0.25, Number(driftToleranceSeconds) || 3);

  let destroyed = false;
  let timer = null;
  let recoveryTimer = null;
  let metadataHandler = null;
  let activeController = null;
  let inFlight = null;
  let activeVersion = null;
  let activeSlotId = null;
  let activeSourceUrl = null;

  function emit(state) {
    if (typeof onState === "function") {
      try { onState(state); } catch (_) {}
    }
  }

  function clearMetadataHandler() {
    if (metadataHandler) {
      video.removeEventListener("loadedmetadata", metadataHandler);
      metadataHandler = null;
    }
  }

  function schedule(delayMs = normalizedResyncMs) {
    clearTimeout(timer);
    if (!destroyed) {
      timer = setTimeout(() => sync({ autoplay: false }), Math.max(1000, delayMs));
    }
  }

  function resetActiveSlot() {
    activeVersion = null;
    activeSlotId = null;
    activeSourceUrl = null;
  }

  function setVideoSource(sourceUrl) {
    if (!sourceUrl) return;
    clearMetadataHandler();
    video.src = sourceUrl;
    if (typeof video.load === "function") video.load();
  }

  function applyFallback(autoplay) {
    resetActiveSlot();
    if (fallbackUrl) {
      setVideoSource(fallbackUrl);
      if (autoplay && typeof video.play === "function") video.play().catch(() => {});
    }
  }

  async function parseJsonResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      throw new Error("invalid_scheduler_response");
    }
  }

  function seekToSchedule(payload, autoplay, sourceChanged) {
    const desired = Math.max(0, Number(payload.offsetSeconds || 0));

    const seek = () => {
      metadataHandler = null;
      if (destroyed) return;
      const duration = Number(video.duration);
      const current = Number(video.currentTime);
      if (Number.isFinite(duration) && duration > 0) {
        const target = Math.min(desired, Math.max(0, duration - 0.25));
        if (sourceChanged || !Number.isFinite(current) || Math.abs(current - target) > driftTolerance) {
          try { video.currentTime = target; } catch (_) {}
        }
      }
      if (autoplay && typeof video.play === "function") video.play().catch(() => {});
    };

    clearMetadataHandler();
    if (video.readyState >= 1) seek();
    else {
      metadataHandler = seek;
      video.addEventListener("loadedmetadata", metadataHandler, { once: true });
    }
  }

  async function performSync({ autoplay = false } = {}) {
    if (destroyed) return null;

    if (activeController) activeController.abort();
    activeController = new AbortController();
    const timeout = setTimeout(() => activeController.abort(), normalizedTimeoutMs);

    try {
      const response = await fetch(
        `${normalizedApiBase}/channels/${encodeURIComponent(normalizedChannel)}/now`,
        {
          cache: "no-store",
          credentials: "omit",
          signal: activeController.signal,
          headers: { Accept: "application/json" }
        }
      );
      const payload = await parseJsonResponse(response);

      if (!response.ok || !payload.ok || !payload.slot || !payload.slot.sourceUrl) {
        throw new Error(payload.error || "scheduler_unavailable");
      }

      const sourceUrl = String(payload.slot.sourceUrl);
      const sourceChanged = (
        activeVersion !== payload.version ||
        activeSlotId !== payload.slot.id ||
        activeSourceUrl !== sourceUrl
      );

      if (sourceChanged) {
        activeVersion = payload.version;
        activeSlotId = payload.slot.id;
        activeSourceUrl = sourceUrl;
        setVideoSource(sourceUrl);
      }

      seekToSchedule(payload, autoplay, sourceChanged);
      const remainingMs = Number(payload.remainingSeconds) > 0
        ? Math.max(1500, (Number(payload.remainingSeconds) + 0.35) * 1000)
        : normalizedResyncMs;
      schedule(Math.min(normalizedResyncMs, remainingMs));

      const state = {
        status: "ready",
        channel: normalizedChannel,
        slot: payload.slot,
        nextSlot: payload.nextSlot || null,
        version: payload.version,
        offsetSeconds: payload.offsetSeconds,
        remainingSeconds: payload.remainingSeconds
      };
      emit(state);
      return state;
    } catch (error) {
      if (destroyed) return null;
      const errorCode = error && error.name === "AbortError"
        ? "scheduler_timeout"
        : String(error && error.message || "scheduler_unavailable");
      applyFallback(autoplay);
      schedule(Math.min(normalizedResyncMs, 15000));
      const state = { status: "recovery", channel: normalizedChannel, error: errorCode };
      emit(state);
      return state;
    } finally {
      clearTimeout(timeout);
      activeController = null;
    }
  }

  function sync(options = {}) {
    if (destroyed) return Promise.resolve(null);
    if (inFlight) return inFlight;
    inFlight = performSync(options).finally(() => { inFlight = null; });
    return inFlight;
  }

  const onEnded = () => sync({ autoplay: true });
  const onError = () => {
    resetActiveSlot();
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => sync({ autoplay: true }), 1500);
  };

  video.addEventListener("ended", onEnded);
  video.addEventListener("error", onError);

  return {
    start: (options = {}) => sync({ autoplay: options.autoplay === true }),
    resync: () => sync({ autoplay: false }),
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      clearTimeout(recoveryTimer);
      clearMetadataHandler();
      if (activeController) activeController.abort();
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      emit({ status: "destroyed", channel: normalizedChannel });
    }
  };
}

if (typeof window !== "undefined") {
  window.createSandblastTvChannelPlayer = createSandblastTvChannelPlayer;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createSandblastTvChannelPlayer };
}

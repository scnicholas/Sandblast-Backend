// consciousness-adapter.js (PARENT-SIDE) (NEW)
"use strict";

/**
 * Nyx Consciousness Adapter (Parent Side)
 *
 * Purpose:
 *  - Convert Nyx reply contracts (from /api/chat or other sources) into a SMALL,
 *    stable NYX_CONSCIOUSNESS packet for the avatar iframe.
 *  - Avoid leaking raw text by default (optional caption support).
 *
 * Exports:
 *  - NyxConsciousnessAdapter.normalizeNyxReply(nyxReply, opts)
 *  - NyxConsciousnessAdapter.makePacket(nyxReply, opts)
 *  - NyxConsciousnessAdapter.postToAvatar(iframeEl, packet, opts)
 */
(function () {
  function isPlainObject(x) {
    return (
      !!x &&
      typeof x === "object" &&
      (Object.getPrototypeOf(x) === Object.prototype ||
        Object.getPrototypeOf(x) === null)
    );
  }

  function safeStr(x) {
    return x === null || x === undefined ? "" : String(x);
  }

  function clampStr(s, maxLen) {
    const str = safeStr(s);
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + "…";
  }

  function normPresence(p) {
    const s = safeStr(p).trim().toLowerCase();
    if (s === "idle" || s === "listening" || s === "speaking") return s;
    return "";
  }

  function normStage(s) {
    const v = safeStr(s).trim().toLowerCase();
    if (v === "boot" || v === "warm" || v === "engaged") return v;
    return "";
  }

  function normDominance(s) {
    const v = safeStr(s).trim().toLowerCase();
    if (v === "soft" || v === "neutral" || v === "firm") return v;
    return "";
  }

  function pick(obj, keys) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return undefined;
  }

  // Hard-minimize big objects: keep only whitelisted small fields.
  function shrinkCog(cog) {
    if (!isPlainObject(cog)) return null;
    return {
      dominance: normDominance(cog.dominance) || undefined,
      velvet: typeof cog.velvet === "boolean" ? cog.velvet : undefined,
      // add tiny safe fields if you want later (no raw text)
    };
  }

  function shrinkSessionPatch(sp) {
    if (!isPlainObject(sp)) return null;

    const out = {};
    const spine = isPlainObject(sp.__spine) ? sp.__spine : null;

    if (spine) {
      out.__spine = {
        lane: safeStr(spine.lane || "").trim() || undefined,
        topic: safeStr(spine.topic || "").trim() || undefined,
        stage: normStage(spine.stage) || undefined,
        dominance: normDominance(spine.dominance) || undefined,
        velvet: typeof spine.velvet === "boolean" ? spine.velvet : undefined,
      };
    }

    // If you want to pass other tiny non-sensitive flags later, add them here.
    // Example: out.musicMomentsLoaded = !!sp.musicMomentsLoaded;

    return out;
  }

  /**
   * Normalize Nyx reply from various shapes into a stable, minimal object.
   * Supports:
   *  - NyxReplyContract style: { lane, reply, cog, sessionPatch, meta, ctx, ... }
   *  - Alternate: { data: { ... } }
   */
  function normalizeNyxReply(nyxReply) {
    let r = nyxReply;

    if (r && isPlainObject(r) && isPlainObject(r.data)) r = r.data;
    if (!isPlainObject(r)) r = {};

    const cog = isPlainObject(r.cog) ? r.cog : null;
    const sp = isPlainObject(r.sessionPatch) ? r.sessionPatch : null;
    const spine = sp && isPlainObject(sp.__spine) ? sp.__spine : null;

    const lane = safeStr(pick(r, ["lane"]) || (spine && spine.lane) || "").trim();
    const topic = safeStr(
      (spine && spine.topic) ||
        (r.meta && r.meta.route) ||
        pick(r, ["topic"]) ||
        ""
    ).trim();

    const stage = normStage(
      pick(r, ["stage"]) ||
        (spine && spine.stage) ||
        ""
    );

    const dominance = normDominance(
      pick(r, ["dominance"]) ||
        (cog && cog.dominance) ||
        (spine && spine.dominance) ||
        ""
    );

    const velvet =
      typeof r.velvet === "boolean"
        ? r.velvet
        : typeof (cog && cog.velvet) === "boolean"
        ? cog.velvet
        : typeof (spine && spine.velvet) === "boolean"
        ? spine.velvet
        : undefined;

    const presenceHint = normPresence(
      pick(r, ["presence", "hintPresence"]) || ""
    );

    // Optional: derive a short caption from reply (OFF by default in makePacket)
    const replyText = safeStr(r.reply || "").trim();

    return {
      lane: lane || "general",
      topic: topic || "unknown",
      stage: stage || "warm",
      dominance: dominance || "neutral",
      velvet: typeof velvet === "boolean" ? velvet : false,
      hintPresence: presenceHint || "",
      cog: shrinkCog(cog),
      sessionPatch: shrinkSessionPatch(sp),
      replyText, // keep internally; caller decides whether to forward
    };
  }

  /**
   * Build the NYX_CONSCIOUSNESS packet to send to the avatar iframe.
   *
   * opts:
   *  - token: string (required for security)
   *  - includeCaption: boolean (default false)
   *  - captionMaxLen: number (default 140)
   *  - hintPresence: override string (idle/listening/speaking)
   */
  function makePacket(nyxReply, opts) {
    const o = isPlainObject(opts) ? opts : {};
    const token = safeStr(o.token || "");
    if (!token) throw new Error("makePacket requires opts.token");

    const n = normalizeNyxReply(nyxReply);

    const packet = {
      t: Date.now(),
      token,
      lane: n.lane,
      topic: n.topic,
      stage: n.stage,
      dominance: n.dominance,
      velvet: !!n.velvet,
      hintPresence: normPresence(o.hintPresence) || n.hintPresence || "",
      cog: n.cog,
      sessionPatch: n.sessionPatch,
    };

    if (o.includeCaption) {
      const maxLen = Number.isFinite(o.captionMaxLen) ? o.captionMaxLen : 140;
      packet.caption = clampStr(n.replyText, maxLen);
    }

    return { type: "NYX_CONSCIOUSNESS", payload: packet };
  }

  /**
   * Post the packet to avatar iframe.
   * opts:
   *  - targetOrigin: string (required)
   */
  function postToAvatar(iframeEl, message, opts) {
    const o = isPlainObject(opts) ? opts : {};
    const targetOrigin = safeStr(o.targetOrigin || "");
    if (!targetOrigin) throw new Error("postToAvatar requires opts.targetOrigin");

    if (!iframeEl || !iframeEl.contentWindow) {
      throw new Error("Avatar iframe not ready (missing contentWindow)");
    }

    iframeEl.contentWindow.postMessage(message, targetOrigin);
  }

  window.NyxConsciousnessAdapter = {
    normalizeNyxReply,
    makePacket,
    postToAvatar,
  };
})();

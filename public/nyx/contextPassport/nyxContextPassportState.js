"use strict";

/**
 * Nyx Context Passport State
 *
 * Purpose:
 * Maintains the latest safe Context Passport UI state independently
 * from assistant reply rendering.
 *
 * Contract:
 * - Never mutates assistant reply text.
 * - Prevents stale domain/language carry.
 * - Resets cleanly on new session.
 * - Stores only safe UI passport fields.
 */

const STATE_VERSION = "nyx.contextPassport.state/1.0";

function now() {
  return Date.now();
}

function isObj(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function makeInitialPassportState() {
  return {
    version: STATE_VERSION,
    active: false,
    latest: null,
    history: [],
    lastRequestId: "",
    lastUpdatedAt: 0,
    stale: false,
  };
}

function normalizePassportForState(passport = {}) {
  if (!isObj(passport) || passport.visible === false) {
    return null;
  }

  return {
    version: safeStr(passport.version, "nyx.contextPassport.parser/1.0"),
    visible: passport.visible !== false,
    authority: "marion",
    sourceLanguage: safeStr(passport.sourceLanguage, "unknown"),
    targetLanguage: safeStr(passport.targetLanguage, "en"),
    activeLanguage: safeStr(passport.activeLanguage || passport.sourceLanguage, "unknown"),
    responseLanguage: safeStr(passport.responseLanguage || passport.targetLanguage, "en"),
    activeDomain: safeStr(passport.activeDomain, "general"),
    confidenceBand: safeStr(passport.confidenceBand, "unknown"),
    toneMode: safeStr(passport.toneMode, "clear_direct"),
    handoffStatus: safeStr(passport.handoffStatus, "available"),
    fallbackUsed: Boolean(passport.fallbackUsed),
    label: safeStr(passport.label),
    shortLabel: safeStr(passport.shortLabel || passport.label),
    requestId: safeStr(passport.requestId),
    updatedAt: Number(passport.updatedAt || now()),
  };
}

function createNyxContextPassportStore(options = {}) {
  const maxHistory = Number.isFinite(Number(options.maxHistory))
    ? Math.max(1, Math.min(25, Number(options.maxHistory)))
    : 8;

  let state = makeInitialPassportState();

  function getState() {
    return clone(state);
  }

  function getLatest() {
    return state.latest ? clone(state.latest) : null;
  }

  function reset(reason = "manual_reset") {
    state = {
      ...makeInitialPassportState(),
      resetReason: safeStr(reason, "manual_reset"),
      lastUpdatedAt: now(),
    };

    return getState();
  }

  function update(passport = {}, meta = {}) {
    const normalized = normalizePassportForState(passport);

    if (!normalized) {
      if (meta.clearOnMissing === true) {
        return reset("missing_metadata_clear");
      }

      state = {
        ...state,
        stale: true,
        lastUpdatedAt: now(),
      };

      return getState();
    }

    const previous = state.latest;
    const requestId = safeStr(
      normalized.requestId ||
        meta.requestId ||
        meta.turnId ||
        ""
    );

    const staleCarry =
      previous &&
      requestId &&
      previous.requestId &&
      requestId === previous.requestId &&
      (
        previous.sourceLanguage !== normalized.sourceLanguage ||
        previous.targetLanguage !== normalized.targetLanguage ||
        previous.activeDomain !== normalized.activeDomain
      );

    const nextPassport = {
      ...normalized,
      requestId: requestId || normalized.requestId,
      updatedAt: now(),
    };

    const nextHistory = [nextPassport]
      .concat(state.history || [])
      .slice(0, maxHistory);

    state = {
      version: STATE_VERSION,
      active: true,
      latest: nextPassport,
      history: nextHistory,
      lastRequestId: nextPassport.requestId,
      lastUpdatedAt: nextPassport.updatedAt,
      stale: false,
      staleCarryBlocked: Boolean(staleCarry),
    };

    return getState();
  }

  function clearIfStale(maxAgeMs = 120000) {
    const age = now() - Number(state.lastUpdatedAt || 0);

    if (state.active && age > maxAgeMs) {
      state = {
        ...state,
        active: false,
        stale: true,
        latest: null,
        lastUpdatedAt: now(),
      };
    }

    return getState();
  }

  return {
    getState,
    getLatest,
    update,
    reset,
    clearIfStale,
  };
}

module.exports = {
  STATE_VERSION,
  makeInitialPassportState,
  normalizePassportForState,
  createNyxContextPassportStore,
};
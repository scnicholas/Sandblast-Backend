"use strict";

/**
 * Nyx Context Passport Handoff
 *
 * Purpose:
 * Provides visual handoff state helpers.
 *
 * Contract:
 * - Handoff is visual only for now.
 * - No automatic language switching.
 * - Marion remains final authority.
 * - No backend diagnostics are rendered.
 */

const HANDOFF_VERSION = "nyx.contextPassport.handoff/1.0";

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function normalizeHandoffStatus(value, fallback = "available") {
  const status = safeStr(value, fallback).toLowerCase();

  if (
    [
      "available",
      "complete",
      "fallback",
      "partial",
      "unavailable",
      "guarded",
      "unknown",
    ].includes(status)
  ) {
    return status;
  }

  return fallback;
}

function isHandoffAvailable(passport = {}) {
  const status = normalizeHandoffStatus(passport && passport.handoffStatus);

  return status === "available" || status === "guarded" || status === "partial";
}

function buildHandoffPassportState(passport = {}) {
  const status = normalizeHandoffStatus(passport.handoffStatus, "available");

  if (!isHandoffAvailable({ handoffStatus: status })) {
    return {
      ...passport,
      visible: passport.visible !== false,
      authority: "marion",
      uiState: status === "fallback" ? "fallback" : "active",
      handoffStatus: status,
      handoffAvailable: false,
      handoffVisualOnly: true,
      autoSwitchAllowed: false,
    };
  }

  const source = safeStr(passport.sourceLanguage || passport.activeLanguage || "unknown").toUpperCase();
  const target = safeStr(passport.targetLanguage || passport.responseLanguage || "en").toUpperCase();
  const domain = safeStr(passport.activeDomainLabel || passport.activeDomain || "General");

  const label =
    source && source !== "UNKNOWN" && source !== target
      ? `${source} → ${target} · ${domain} · Marion ✓`
      : `Switch available · Marion guarded`;

  return {
    ...passport,
    visible: passport.visible !== false,
    authority: "marion",
    uiState: "handoff",
    handoffStatus: status,
    handoffAvailable: true,
    handoffVisualOnly: true,
    autoSwitchAllowed: false,
    label,
    shortLabel: label.length > 52 ? `${label.slice(0, 49).trim()}…` : label,
  };
}

function confirmHandoff(passport = {}) {
  return {
    ...passport,
    authority: "marion",
    uiState: "handoff_confirmed",
    handoffStatus: "complete",
    handoffAvailable: false,
    handoffVisualOnly: true,
    autoSwitchAllowed: false,
    label: passport.shortLabel || passport.label || "Handoff complete · Marion ✓",
    confirmedAt: Date.now(),
  };
}

module.exports = {
  HANDOFF_VERSION,
  safeStr,
  normalizeHandoffStatus,
  isHandoffAvailable,
  buildHandoffPassportState,
  confirmHandoff,
};

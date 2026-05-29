"use strict";

/**
 * Nyx Context Passport Fallback States
 *
 * Purpose:
 * Provides calm, safe user-facing labels for fallback and ready states.
 *
 * Contract:
 * - Fallback must not feel like a backend error.
 * - No diagnostics.
 * - Marion authority remains visible.
 */

const FALLBACK_STATES_VERSION = "nyx.contextPassport.fallbackStates/1.0";

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function normalizeLanguage(value, fallback = "en") {
  const raw = safeStr(value, fallback).toLowerCase();

  if (raw === "eng" || raw.startsWith("en-")) return "en";
  if (raw === "spa" || raw === "es-419" || raw.startsWith("es-")) return "es";
  if (raw === "fre" || raw === "fra" || raw.startsWith("fr-")) return "fr";
  if (["en", "es", "fr"].includes(raw)) return raw;

  return fallback;
}

function labelForLanguage(code) {
  const lang = normalizeLanguage(code, "en");
  const labels = {
    en: "EN",
    es: "ES",
    fr: "FR",
  };

  return labels[lang] || "EN";
}

function getReadyPassportState() {
  return {
    visible: true,
    authority: "marion",
    uiState: "ready",
    sourceLanguage: "unknown",
    targetLanguage: "en",
    activeDomain: "general",
    fallbackUsed: false,
    handoffStatus: "available",
    label: "LanguageSphere ready",
    shortLabel: "LanguageSphere ready",
  };
}

function getFallbackPassportState(payload = {}) {
  const targetLanguage = normalizeLanguage(
    payload.targetLanguage ||
      payload.responseLanguage ||
      "en",
    "en"
  );

  const shortTarget = labelForLanguage(targetLanguage);

  return {
    visible: true,
    authority: "marion",
    uiState: "fallback",
    sourceLanguage: normalizeLanguage(
      payload.sourceLanguage ||
        payload.detectedLanguage ||
        "unknown",
      "en"
    ),
    targetLanguage,
    activeDomain: safeStr(payload.activeDomain || payload.domain, "general"),
    confidenceBand: safeStr(payload.confidenceBand, "low"),
    toneMode: safeStr(payload.toneMode, "clear_direct"),
    fallbackUsed: true,
    handoffStatus: "fallback",
    label: `${shortTarget} fallback · Marion ✓`,
    shortLabel: `${shortTarget} fallback · Marion ✓`,
  };
}

function isFallbackState(passport = {}) {
  return Boolean(
    passport &&
      typeof passport === "object" &&
      (passport.uiState === "fallback" || passport.fallbackUsed === true)
  );
}

module.exports = {
  FALLBACK_STATES_VERSION,
  safeStr,
  normalizeLanguage,
  labelForLanguage,
  getReadyPassportState,
  getFallbackPassportState,
  isFallbackState,
};
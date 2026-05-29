"use strict";

/**
 * Nyx Status Chip Controller
 *
 * Purpose:
 * Controls where and when the Context Passport chip appears.
 *
 * Contract:
 * - Does not mutate assistant reply.
 * - Only renders safe passport output.
 * - Degrades silently when metadata/container is missing.
 */

const {
  renderContextPassportChip,
  hideContextPassportChip,
} = require("../contextPassport/nyxContextPassportRenderer");

const STATUS_CHIP_CONTROLLER_VERSION = "nyx.statusChipController.contextPassport/1.0";

function isObj(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeStr(value, fallback = "") {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function shouldShowPassport(passport = {}) {
  return Boolean(
    isObj(passport) &&
      passport.visible !== false &&
      passport.authority === "marion" &&
      safeStr(passport.shortLabel || passport.label)
  );
}

function updateNyxStatusChip(target, passport = {}, options = {}) {
  if (!shouldShowPassport(passport)) {
    return hideContextPassportChip(target);
  }

  return renderContextPassportChip(target, passport, options);
}

function clearNyxStatusChip(target) {
  return hideContextPassportChip(target);
}

module.exports = {
  STATUS_CHIP_CONTROLLER_VERSION,
  isObj,
  safeStr,
  shouldShowPassport,
  updateNyxStatusChip,
  clearNyxStatusChip,
};
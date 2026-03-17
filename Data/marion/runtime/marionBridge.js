"use strict";

const { routeMarion } = require("./marionRouter");
const { composeMarionResponse } = require("./composeMarionResponse");

function _trim(v) {
  return v == null ? "" : String(v).trim();
}

function _safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function runMarionBridge(input = {}) {
  const text = _trim(input.text || input.userText || input.query);
  const affect = _safeObj(input.affect);
  const supportFlags = _safeObj(input.supportFlags);

  const routed = routeMarion({
    text,
    affect,
    supportFlags,
    riskLevel: input.riskLevel
  });

  const composed = composeMarionResponse(routed, {
    text,
    affect,
    supportFlags
  });

  return {
    ok: true,
    text,
    marion: composed,
    routed,
    bridgeMeta: {
      version: "1.0.0",
      source: "marionBridge",
      readyForNyx: true
    }
  };
}

module.exports = {
  runMarionBridge
};

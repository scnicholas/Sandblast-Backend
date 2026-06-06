"use strict";

const LINGOSENTINEL_MARION_AUTHORITY_BRIDGE_VERSION = "nyx.lingosentinel.marionAuthorityBridge/0.1";
function safeObject(value){return value && typeof value === "object" && !Array.isArray(value) ? value : {};}
function safeString(value){return value == null ? "" : String(value).replace(/\s+/g," ").trim();}
function buildLingoSentinelMarionAuthorityBridge(payload = {}, options = {}) {
  const p = safeObject(payload);
  const languageMeta = safeObject(p.languageMeta || p.language || safeObject(p.lingoSentinel).languageMeta);
  const translationMeta = safeObject(p.translationMeta || safeObject(p.lingoSentinel).translationMeta);
  const unknownLanguageAlert = safeObject(p.unknownLanguageAlert || safeObject(p.lingoSentinel).unknownLanguageAlert);
  const scannerHeartbeat = safeObject(p.scannerHeartbeat || safeObject(p.lingoSentinel).scannerHeartbeat);
  const active = Boolean(safeString(p.text || p.message || p.input) || Object.keys(languageMeta).length || Object.keys(translationMeta).length || Object.keys(unknownLanguageAlert).length);
  return {
    version: LINGOSENTINEL_MARION_AUTHORITY_BRIDGE_VERSION,
    active,
    lane: "language",
    source: "LingoSentinelMarionAuthorityBridge",
    languageMeta,
    translationMeta,
    unknownLanguageAlert,
    scannerHeartbeat,
    advisoryOnly: true,
    finalAnswerAuthorized: false,
    finalAuthority: "Marion",
    marionAuthorityRequired: true,
    publicReplyVisible: false,
    userFacing: false,
    text: "",
    options: safeObject(options)
  };
}
module.exports = { LINGOSENTINEL_MARION_AUTHORITY_BRIDGE_VERSION, buildLingoSentinelMarionAuthorityBridge, default: buildLingoSentinelMarionAuthorityBridge };

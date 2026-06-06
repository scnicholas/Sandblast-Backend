"use strict";

const LINGOLINK_MARION_AUTHORITY_BRIDGE_VERSION = "nyx.lingolink.marionAuthorityBridge/0.1";
function safeObject(value){return value && typeof value === "object" && !Array.isArray(value) ? value : {};}
function safeString(value){return value == null ? "" : String(value).replace(/\s+/g," ").trim();}
function buildLingoLinkMarionAuthorityBridge(payload = {}, options = {}) {
  const p = safeObject(payload);
  const languageMeta = safeObject(p.languageMeta || p.language || safeObject(p.lingoLink).languageMeta);
  const translationMeta = safeObject(p.translationMeta || safeObject(p.lingoLink).translationMeta);
  const unknownLanguageAlert = safeObject(p.unknownLanguageAlert || safeObject(p.lingoLink).unknownLanguageAlert);
  const scannerHeartbeat = safeObject(p.scannerHeartbeat || safeObject(p.lingoLink).scannerHeartbeat);
  const active = Boolean(safeString(p.text || p.message || p.input) || Object.keys(languageMeta).length || Object.keys(translationMeta).length || Object.keys(unknownLanguageAlert).length);
  return {
    version: LINGOLINK_MARION_AUTHORITY_BRIDGE_VERSION,
    active,
    lane: "language",
    source: "LingoLinkMarionAuthorityBridge",
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
module.exports = { LINGOLINK_MARION_AUTHORITY_BRIDGE_VERSION, buildLingoLinkMarionAuthorityBridge, default: buildLingoLinkMarionAuthorityBridge };

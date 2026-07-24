"use strict";

(function attachLingoSentinelPublicTranslationResultClient(globalScope) {
  const VERSION = "lingosentinel.publicTranslationResultClient/11.0-sidecar";
  const CONTRACT = "lingosentinel.translationResult/1.0";
  const EVENT = "LINGOSENTINEL_TRANSLATION_RESULT";
  const VALID_STATUS = Object.freeze(["pending", "translated", "low_confidence", "failed", "expired", "original_only", "clarification_recommended"]);
  const BLOCKED = /(?:token|secret|password|authorization|cookie|api[_-]?key|privateKey|sessionId|membershipCredential|credentialHash|governance|telemetry|providerEndpoint|modelPath|prompt)/i;
  let roomId = "";
  let handler = null;
  let realtimeClient = null;
  const results = new Map();
  const pendingByMessage = new Map();
  const counters = { accepted: 0, duplicate: 0, malformed: 0, wrongRoom: 0, unknownMessage: 0, privateField: 0, recovered: 0 };

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function key(messageId, targetLanguage) { return clean(messageId) + "\u0000" + clean(targetLanguage).toLowerCase(); }
  function privateField(value, path) {
    if (!value || typeof value !== "object") return "";
    for (const name in value) {
      if (!Object.prototype.hasOwnProperty.call(value, name)) continue;
      const next = path ? path + "." + name : name;
      if (BLOCKED.test(name)) return next;
      const nested = privateField(value[name], next);
      if (nested) return nested;
    }
    return "";
  }
  function knownMessage(messageId) {
    const receiver = globalScope.LingoSentinelPublicMessageReceiver;
    return !receiver || typeof receiver.hasMessage !== "function" ? true : receiver.hasMessage(messageId);
  }
  function normalize(data) {
    const confidence = Number(data && data.confidence);
    return Object.freeze({
      contract: CONTRACT,
      translationId: clean(data && data.translationId).slice(0, 96),
      messageId: clean(data && data.messageId).slice(0, 96),
      roomId: clean(data && data.roomId).slice(0, 96),
      sourceLanguage: clean(data && data.sourceLanguage).toLowerCase().slice(0, 16),
      targetLanguage: clean(data && data.targetLanguage).toLowerCase().slice(0, 16),
      originalText: String(data && data.originalText == null ? "" : data.originalText).slice(0, 4000),
      translatedText: String(data && data.translatedText == null ? "" : data.translatedText).slice(0, 4000),
      status: clean(data && data.status).toLowerCase(),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      provider: clean(data && data.provider || "internal").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32),
      locale: clean(data && data.locale).slice(0, 16),
      formality: clean(data && data.formality || "neutral").slice(0, 16),
      qualityDecision: clean(data && data.qualityDecision).slice(0, 40),
      createdAt: clean(data && data.createdAt),
      version: 1
    });
  }
  function validate(data, options) {
    const opts = options && typeof options === "object" ? options : {};
    if (!data || typeof data !== "object") return { ok: false, code: "TRANSLATION_RESULT_INVALID" };
    const blocked = privateField(data, "");
    if (blocked) return { ok: false, code: "PRIVATE_FIELD_REJECTED", field: blocked };
    if (data.contract !== CONTRACT || Number(data.version) !== 1) return { ok: false, code: "TRANSLATION_CONTRACT_INVALID" };
    const value = normalize(data);
    if (!value.translationId || !value.messageId || !value.roomId || !value.targetLanguage) return { ok: false, code: "TRANSLATION_IDENTITY_INVALID" };
    if (roomId && value.roomId !== roomId) return { ok: false, code: "WRONG_ROOM_REJECTED" };
    if (!VALID_STATUS.includes(value.status)) return { ok: false, code: "TRANSLATION_STATUS_INVALID" };
    if (["translated", "low_confidence"].includes(value.status) && !value.translatedText) return { ok: false, code: "TRANSLATED_TEXT_REQUIRED" };
    if (!opts.allowUnknownMessage && !knownMessage(value.messageId)) return { ok: false, code: "UNKNOWN_MESSAGE_BUFFERED", value };
    return { ok: true, value };
  }
  function emit(value, options) {
    if (typeof handler === "function") { try { handler(value, options || {}); } catch (_) {} }
    try { if (globalScope.dispatchEvent && typeof globalScope.CustomEvent === "function") globalScope.dispatchEvent(new globalScope.CustomEvent("lingosentinel:translation-result", { detail: value })); } catch (_) {}
  }
  function accept(data, options) {
    const opts = options && typeof options === "object" ? options : {};
    const validation = validate(data, opts);
    if (!validation.ok) {
      if (validation.code === "WRONG_ROOM_REJECTED") counters.wrongRoom++;
      else if (validation.code === "PRIVATE_FIELD_REJECTED") counters.privateField++;
      else if (validation.code === "UNKNOWN_MESSAGE_BUFFERED" && validation.value) {
        counters.unknownMessage++;
        const list = pendingByMessage.get(validation.value.messageId) || [];
        list.push(validation.value); pendingByMessage.set(validation.value.messageId, list.slice(-10));
      } else counters.malformed++;
      return validation;
    }
    const value = validation.value;
    const resultKey = key(value.messageId, value.targetLanguage);
    const existing = results.get(resultKey);
    if (existing && existing.translationId === value.translationId && existing.status === value.status) { counters.duplicate++; return { ok: false, code: "DUPLICATE_TRANSLATION_REJECTED" }; }
    results.set(resultKey, value);
    while (results.size > 500) results.delete(results.keys().next().value);
    counters.accepted++; if (opts.recovered) counters.recovered++;
    emit(value, opts);
    return { ok: true, result: value };
  }
  function flush(messageId) {
    const id = clean(messageId); const list = pendingByMessage.get(id) || [];
    pendingByMessage.delete(id);
    return list.map(function (item) { return accept(item, { allowUnknownMessage: true, buffered: true }); });
  }
  function receive(message) {
    if (clean(message && message.name) !== EVENT) return { ok: false, code: "TRANSLATION_EVENT_INVALID" };
    return accept(message.data, {});
  }
  function receiveRecovered(data) { return accept(data, { recovered: true, allowUnknownMessage: false }); }
  async function start(options) {
    const opts = options && typeof options === "object" ? options : {};
    realtimeClient = opts.realtimeClient || globalScope.LingoSentinelPublicRealtimeClient;
    const state = realtimeClient && realtimeClient.getState ? realtimeClient.getState() : null;
    roomId = clean(opts.roomId || state && state.active && state.active.roomId);
    handler = typeof opts.onResult === "function" ? opts.onResult : null;
    if (!roomId) throw new Error("LINGOSENTINEL_TRANSLATION_ROOM_REQUIRED");
    if (!realtimeClient || typeof realtimeClient.subscribe !== "function") throw new Error("LINGOSENTINEL_REALTIME_CLIENT_UNAVAILABLE");
    await realtimeClient.subscribe(receive, EVENT, { lane: "message" });
    return { ok: true, roomId, eventType: EVENT, version: VERSION };
  }
  function stop() { roomId = ""; handler = null; realtimeClient = null; pendingByMessage.clear(); return { ok: true }; }
  async function requestTranslation(messageId, options) {
    const opts = options && typeof options === "object" ? options : {};
    const rt = opts.realtimeClient || realtimeClient || globalScope.LingoSentinelPublicRealtimeClient;
    const state = rt && rt.getState ? rt.getState() : null;
    const active = state && state.active;
    const id = clean(messageId);
    if (!active || !id) throw new Error("LINGOSENTINEL_TRANSLATION_REQUEST_CONTEXT_REQUIRED");
    const preferencesApi = globalScope.LingoSentinelPublicLanguagePreferences;
    const preferences = opts.preferences || preferencesApi && preferencesApi.get(active.roomId) || {};
    return rt.authorizedRequest("/api/lingosentinel/messages/" + encodeURIComponent(id) + "/translate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: active.clientId, sessionId: active.sessionId, targetLanguage: clean(opts.targetLanguage || preferences.targetLanguage || "en"), locale: clean(opts.locale || preferences.locale), formality: clean(opts.formality || preferences.formality || "neutral") })
    }, active.roomId);
  }
  async function fetchForMessage(messageId, options) {
    const opts = options && typeof options === "object" ? options : {};
    const rt = opts.realtimeClient || realtimeClient || globalScope.LingoSentinelPublicRealtimeClient;
    const state = rt && rt.getState ? rt.getState() : null; const active = state && state.active;
    if (!active) throw new Error("LINGOSENTINEL_TRANSLATION_FETCH_CONTEXT_REQUIRED");
    const target = clean(opts.targetLanguage);
    const suffix = target ? "/" + encodeURIComponent(target) : "";
    const data = await rt.authorizedRequest("/api/lingosentinel/messages/" + encodeURIComponent(clean(messageId)) + "/translations" + suffix + "?clientId=" + encodeURIComponent(active.clientId) + "&sessionId=" + encodeURIComponent(active.sessionId), {}, active.roomId);
    const list = Array.isArray(data.translations) ? data.translations : data.translation ? [data.translation] : [];
    list.forEach(function (item) { accept(item, { recovered: true }); });
    return data;
  }
  function get(messageId, targetLanguage) { return results.get(key(messageId, targetLanguage)) || null; }
  function list(messageId) { const id = clean(messageId); return Array.from(results.values()).filter(function (item) { return item.messageId === id; }); }
  function diagnostics() { return { version: VERSION, counters: Object.assign({}, counters), resultCount: results.size, pendingMessageCount: pendingByMessage.size, contentLogged: false, credentialsStored: false }; }

  try { if (globalScope.addEventListener) globalScope.addEventListener("lingosentinel:message", function (event) { const id = clean(event && event.detail && event.detail.messageId); if (id) flush(id); }); } catch (_) {}
  const api = Object.freeze({ version: VERSION, contract: CONTRACT, eventType: EVENT, start, stop, receive, receiveRecovered, accept, validate, flush, requestTranslation, fetchForMessage, get, list, getDiagnostics: diagnostics });
  globalScope.LingoSentinelPublicTranslationResultClient = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

"use strict";

(function attachLingoSentinelPublicMessageReceiver(globalScope) {
  const VERSION = "lingosentinel.publicMessageReceiver/7.0-canonical";
  const CONTRACT = "lingosentinel.message/1.0";
  const EVENT = "LINGOSENTINEL_MESSAGE_CREATED";
  const BLOCKED = /(?:token|secret|password|authorization|cookie|api[_-]?key|private|sessionId|membershipCredential|credentialHash|governance|telemetry|capability)/i;
  const seen = new Map();
  let activeRoomId = "";
  let activeClientId = "";
  let handler = null;
  let unsubscribeState = null;
  const counters = { accepted: 0, malformed: 0, wrongRoom: 0, duplicate: 0, privateField: 0 };

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function findPrivate(value, path) {
    if (!value || typeof value !== "object") return "";
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const next = path ? path + "." + key : key;
      if (BLOCKED.test(key)) return next;
      const nested = findPrivate(value[key], next);
      if (nested) return nested;
    }
    return "";
  }
  function prune() {
    const now = Date.now();
    seen.forEach(function (time, id) { if (now - time > 10 * 60 * 1000) seen.delete(id); });
    while (seen.size > 500) seen.delete(seen.keys().next().value);
  }
  function validate(message) {
    const name = clean(message && message.name);
    const data = message && message.data;
    if (name !== EVENT || !data || typeof data !== "object") return { ok: false, code: "MESSAGE_EVENT_INVALID" };
    const privateField = findPrivate(data, "");
    if (privateField) return { ok: false, code: "PRIVATE_FIELD_REJECTED", field: privateField };
    if (data.contract !== CONTRACT || data.eventType !== EVENT || Number(data.version) !== 1) return { ok: false, code: "MESSAGE_CONTRACT_INVALID" };
    if (clean(data.roomId) !== activeRoomId) return { ok: false, code: "WRONG_ROOM_REJECTED" };
    if (!clean(data.messageId) || !data.sender || !clean(data.sender.clientId)) return { ok: false, code: "MESSAGE_IDENTITY_INVALID" };
    if (typeof data.displayText !== "string" || typeof data.originalText !== "string") return { ok: false, code: "MESSAGE_TEXT_INVALID" };
    if (data.displayText !== data.originalText) return { ok: false, code: "ENGLISH_TEXT_DRIFT" };
    if (!data.translation || data.translation.status !== "bypassed" || data.translation.required !== false) return { ok: false, code: "TRANSLATION_BYPASS_INVALID" };
    if (!Number.isSafeInteger(data.sequence) || data.sequence < 1) return { ok: false, code: "MESSAGE_SEQUENCE_INVALID" };
    prune();
    if (seen.has(data.messageId)) return { ok: false, code: "DUPLICATE_REJECTED" };
    return { ok: true, data };
  }
  function emit(detail) {
    if (typeof handler === "function") { try { handler(detail); } catch (_) {} }
    try { if (globalScope.dispatchEvent && typeof globalScope.CustomEvent === "function") globalScope.dispatchEvent(new globalScope.CustomEvent("lingosentinel:message", { detail: detail })); } catch (_) {}
  }
  function receive(message) {
    const result = validate(message);
    if (!result.ok) {
      if (result.code === "WRONG_ROOM_REJECTED") counters.wrongRoom += 1;
      else if (result.code === "DUPLICATE_REJECTED") counters.duplicate += 1;
      else if (result.code === "PRIVATE_FIELD_REJECTED") counters.privateField += 1;
      else counters.malformed += 1;
      return result;
    }
    const data = result.data;
    seen.set(data.messageId, Date.now()); counters.accepted += 1;
    const detail = Object.freeze({
      direction: clean(data.sender.clientId) === activeClientId ? "outgoing" : "incoming",
      messageId: clean(data.messageId),
      clientRequestId: clean(data.clientRequestId),
      roomId: clean(data.roomId),
      senderId: clean(data.sender.clientId),
      senderName: clean(data.sender.displayName || "Participant").slice(0, 80),
      senderRole: data.sender.role === "creator" ? "creator" : "participant",
      text: String(data.displayText),
      sequence: data.sequence,
      createdAt: clean(data.createdAt),
      publishedAt: clean(data.publishedAt)
    });
    emit(detail);
    return { ok: true, message: detail };
  }
  async function start(options) {
    const opts = options && typeof options === "object" ? options : {};
    const realtime = opts.realtimeClient || globalScope.LingoSentinelPublicRealtimeClient;
    if (!realtime || typeof realtime.subscribe !== "function") throw new Error("LINGOSENTINEL_REALTIME_CLIENT_UNAVAILABLE");
    activeRoomId = clean(opts.roomId || realtime.getState().active && realtime.getState().active.roomId);
    activeClientId = clean(opts.clientId || realtime.getState().active && realtime.getState().active.clientId);
    if (!activeRoomId || !activeClientId) throw new Error("LINGOSENTINEL_RECEIVER_CONTEXT_REQUIRED");
    handler = typeof opts.onMessage === "function" ? opts.onMessage : null;
    await realtime.subscribe(receive, EVENT);
    if (typeof realtime.onStateChange === "function") unsubscribeState = realtime.onStateChange(function (event) { if (event && event.state === "closed") stop(); });
    return { ok: true, roomId: activeRoomId, eventType: EVENT, version: VERSION };
  }
  function stop() {
    if (typeof unsubscribeState === "function") unsubscribeState();
    unsubscribeState = null; handler = null; activeRoomId = ""; activeClientId = ""; seen.clear();
    return { ok: true };
  }
  function getDiagnostics() { return { version: VERSION, counters: Object.assign({}, counters), contentStored: false, credentialsStored: false }; }
  const receiver = Object.freeze({ version: VERSION, contract: CONTRACT, eventType: EVENT, start, stop, receive, validate, getDiagnostics });
  globalScope.LingoSentinelPublicMessageReceiver = receiver;
  if (typeof module !== "undefined" && module.exports) module.exports = receiver;
})(typeof window !== "undefined" ? window : globalThis);

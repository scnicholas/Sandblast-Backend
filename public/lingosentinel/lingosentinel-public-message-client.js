"use strict";

(function attachLingoSentinelPublicMessageClient(globalScope) {
  const VERSION = "lingosentinel.publicMessageClient/6.0-backend-publish";
  const ENDPOINT = "/api/lingosentinel/messages";
  let state = "idle";
  const listeners = new Set();
  const recent = new Map();

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function requestId() {
    try { const bytes = new Uint8Array(10); globalScope.crypto.getRandomValues(bytes); return "lsreq_" + Date.now().toString(36) + "_" + Array.from(bytes).map(function (v) { return v.toString(16).padStart(2, "0"); }).join(""); }
    catch (_) { return "lsreq_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2); }
  }
  function setState(next, details) {
    state = next;
    const event = Object.freeze({ state, details: details || null, at: new Date().toISOString() });
    listeners.forEach(function (listener) { try { listener(event); } catch (_) {} });
    return event;
  }
  function realtimeClient() {
    const client = globalScope.LingoSentinelPublicRealtimeClient;
    if (!client || typeof client.authorizedRequest !== "function") throw new Error("LINGOSENTINEL_REALTIME_CLIENT_UNAVAILABLE");
    return client;
  }
  function activeContext() {
    const realtime = realtimeClient();
    const current = realtime.getState();
    if (!current || current.state !== "connected" || !current.active) throw new Error("LINGOSENTINEL_CONNECTION_NOT_READY");
    return current.active;
  }
  function fingerprint(roomId, text) { return roomId + "\u0000" + text; }
  async function send(input) {
    const payload = input && typeof input === "object" ? input : { text: input };
    const text = String(payload.text == null ? "" : payload.text).replace(/\r\n?/g, "\n");
    if (!text.trim()) return { ok: false, error: "MESSAGE_TEXT_REQUIRED" };
    if (text.length > 4000) return { ok: false, error: "MESSAGE_TEXT_TOO_LONG" };
    const active = activeContext();
    const roomId = clean(payload.roomId || active.roomId);
    if (roomId !== active.roomId) return { ok: false, error: "MESSAGE_ROOM_MISMATCH" };
    const key = fingerprint(roomId, text);
    const prior = recent.get(key);
    if (prior && Date.now() - prior.createdAt < 750) return prior.promise;

    const clientRequestId = clean(payload.clientRequestId || requestId());
    setState("validating", { clientRequestId, roomId });
    const promise = (async function () {
      try {
        setState("sending", { clientRequestId, roomId });
        const data = await realtimeClient().authorizedRequest(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientRequestId,
            roomId,
            mode: clean(payload.mode || active.mode || "group_room"),
            type: "text",
            text,
            sourceLanguage: "en",
            targetLanguage: "en",
            clientId: active.clientId,
            sessionId: active.sessionId
          })
        }, roomId);
        setState("published", data);
        return data;
      } catch (error) {
        const result = { ok: false, error: clean(error && error.message || "LINGOSENTINEL_MESSAGE_SEND_FAILED"), status: error && error.status || 0, clientRequestId, roomId };
        setState("failed", result);
        return result;
      } finally {
        setTimeout(function () { recent.delete(key); }, 800);
      }
    })();
    recent.set(key, { createdAt: Date.now(), promise });
    return promise;
  }
  function onStateChange(listener) { if (typeof listener === "function") listeners.add(listener); return function () { listeners.delete(listener); }; }
  function getState() { return { state, version: VERSION }; }
  const client = Object.freeze({ version: VERSION, endpoint: ENDPOINT, send, onStateChange, getState, createRequestId: requestId });
  globalScope.LingoSentinelPublicMessageClient = client;
  if (typeof module !== "undefined" && module.exports) module.exports = client;
})(typeof window !== "undefined" ? window : globalThis);

"use strict";

/** Browser-safe room, membership, token, and subscription authority for Layers 3-7. */
(function attachLingoSentinelPublicRealtimeClient(globalScope) {
  const API_BASE = "/api/lingosentinel";
  const VERSION = "lingosentinel.publicRealtimeClient/7.0-subscription-only";
  const CREDENTIAL_PREFIX = "lingosentinel.roomCredential.v1.";
  const MESSAGE_EVENT = "LINGOSENTINEL_MESSAGE_CREATED";
  let realtime = null;
  let channel = null;
  let active = null;
  let activeCredential = "";
  let state = "initialized";
  let subscription = null;
  const stateListeners = new Set();

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function endpoint(value, fallback) {
    const text = clean(value || fallback);
    if (/\/internal\/lingosentinel\//i.test(text)) throw new Error("LINGOSENTINEL_INTERNAL_ROUTE_BLOCKED");
    return text || fallback;
  }
  function safeSessionStorage() { try { return globalScope.sessionStorage || null; } catch (_) { return null; } }
  function credentialKey(roomId) { return CREDENTIAL_PREFIX + clean(roomId).replace(/[^a-zA-Z0-9:_-]/g, "-"); }
  function storeCredential(roomId, credential) {
    const value = clean(credential); activeCredential = value;
    try { const storage = safeSessionStorage(); if (storage && value) storage.setItem(credentialKey(roomId), value); } catch (_) {}
  }
  function loadCredential(roomId) {
    if (active && active.roomId === roomId && activeCredential) return activeCredential;
    try { const storage = safeSessionStorage(); return clean(storage && storage.getItem(credentialKey(roomId))); } catch (_) { return ""; }
  }
  function clearCredential(roomId) {
    if (!roomId || (active && active.roomId === roomId)) activeCredential = "";
    try { const storage = safeSessionStorage(); if (storage) storage.removeItem(credentialKey(roomId)); } catch (_) {}
  }
  async function readJson(response) { try { return await response.json(); } catch (_) { return null; } }
  async function request(url, options) {
    const response = await fetch(endpoint(url, url), Object.assign({ credentials: "omit", cache: "no-store" }, options || {}));
    const data = await readJson(response);
    if (!response.ok || !data || data.ok !== true) {
      const error = new Error(clean(data && ((data.errors && data.errors[0] && (data.errors[0].code || data.errors[0])) || data.error)) || "LINGOSENTINEL_REALTIME_REQUEST_FAILED");
      error.status = response.status; error.data = data; throw error;
    }
    return data;
  }
  async function authorizedRequest(url, options, roomId) {
    const opts = Object.assign({}, options || {});
    const credential = loadCredential(clean(roomId || (active && active.roomId)));
    if (!credential) throw new Error("LINGOSENTINEL_MEMBERSHIP_CREDENTIAL_UNAVAILABLE");
    opts.headers = Object.assign({}, opts.headers || {}, { "x-lingosentinel-membership": credential });
    return request(url, opts);
  }
  function baseClient() { return globalScope.LingoSentinelPublicClient || globalScope.LingoSentinelPublicTranslationClient || null; }
  function identity(options) {
    const client = baseClient();
    if (!client || typeof client.getOrCreateIdentity !== "function" || typeof client.getOrCreateSessionId !== "function") throw new Error("LINGOSENTINEL_IDENTITY_CLIENT_UNAVAILABLE");
    const id = client.getOrCreateIdentity(options || {});
    return Object.assign({}, id, { sessionId: client.getOrCreateSessionId() });
  }
  function payloadWithIdentity(payload, options) {
    const id = identity(options);
    return Object.assign({}, payload || {}, { clientId: id.clientId, sessionId: id.sessionId, displayName: id.displayName });
  }
  function setState(next, details) {
    state = clean(next || state) || state;
    const event = Object.freeze({ state, details: details || null, at: new Date().toISOString(), active: active ? Object.assign({}, active) : null });
    stateListeners.forEach(function (listener) { try { listener(event); } catch (_) {} });
    return event;
  }
  async function reportState(next, details) {
    const event = setState(next, details);
    if (!active || !active.sessionId || !activeCredential) return event;
    try {
      await authorizedRequest(API_BASE + "/connections/state", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: active.sessionId, clientId: active.clientId, state: next, errorCode: clean(details && (details.code || details.errorCode)), status: details && details.statusCode })
      }, active.roomId);
    } catch (_) {}
    return event;
  }
  async function createRoom(input, options) {
    const body = payloadWithIdentity(input || {}, options);
    const result = await request(API_BASE + "/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (result.membershipCredential) storeCredential(result.room && result.room.roomId || body.roomId, result.membershipCredential);
    return result;
  }
  async function joinRoom(roomId, options) {
    const body = payloadWithIdentity({}, options);
    const result = await request(API_BASE + "/rooms/" + encodeURIComponent(clean(roomId)) + "/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!result.membershipCredential) throw new Error("LINGOSENTINEL_MEMBERSHIP_CREDENTIAL_MISSING");
    storeCredential(clean(roomId), result.membershipCredential);
    return result;
  }
  async function leaveRoom(roomId, options) {
    const body = payloadWithIdentity({}, options);
    const result = await authorizedRequest(API_BASE + "/rooms/" + encodeURIComponent(clean(roomId)) + "/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, roomId);
    clearCredential(clean(roomId));
    return result;
  }
  async function getRoom(roomId, options) {
    const id = identity(options); const query = "?clientId=" + encodeURIComponent(id.clientId) + "&sessionId=" + encodeURIComponent(id.sessionId);
    return authorizedRequest(API_BASE + "/rooms/" + encodeURIComponent(clean(roomId)) + query, {}, roomId);
  }
  async function getParticipants(roomId, options) {
    const id = identity(options); const query = "?clientId=" + encodeURIComponent(id.clientId) + "&sessionId=" + encodeURIComponent(id.sessionId);
    return authorizedRequest(API_BASE + "/rooms/" + encodeURIComponent(clean(roomId)) + "/participants" + query, {}, roomId);
  }
  function resolveAbly() {
    const Ably = globalScope.Ably;
    const Ctor = Ably && (Ably.Realtime && (Ably.Realtime.Promise || Ably.Realtime));
    if (typeof Ctor !== "function") throw new Error("ABLY_BROWSER_SDK_UNAVAILABLE");
    return Ctor;
  }
  async function tokenFor(config) {
    const client = baseClient();
    if (!client || typeof client.requestRealtimeToken !== "function") throw new Error("LINGOSENTINEL_TOKEN_CLIENT_UNAVAILABLE");
    const credential = loadCredential(config.roomId);
    const result = await client.requestRealtimeToken({ mode: config.mode, roomId: config.roomId, displayName: config.displayName }, { membershipCredential: credential });
    if (!result || result.ok !== true || !result.tokenRequest) throw new Error(result && result.error || "LINGOSENTINEL_TOKEN_FAILED");
    return result;
  }
  function bindConnectionEvents(instance) {
    if (!instance || !instance.connection || typeof instance.connection.on !== "function") return;
    ["connecting", "connected", "disconnected", "suspended", "failed", "closed"].forEach(function (name) {
      instance.connection.on(name, function (change) {
        const mapped = name === "disconnected" && active && active.reconnectExpected ? "reconnecting" : name;
        reportState(mapped, change && change.reason || null);
      });
    });
  }
  async function connect(options) {
    const opts = options && typeof options === "object" ? options : {};
    const roomId = clean(opts.roomId || "lingosentinel-main");
    const mode = clean(opts.mode || "group_room");
    const id = identity({ displayName: opts.displayName });
    if (active) await disconnect({ leaveRoom: active.roomId !== roomId });
    await joinRoom(roomId, opts);
    const firstToken = await tokenFor({ roomId, mode, displayName: id.displayName });
    active = { roomId, mode, channel: firstToken.channel, clientId: id.clientId, sessionId: id.sessionId, displayName: id.displayName, reconnectExpected: true };
    await authorizedRequest(API_BASE + "/connections/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(active) }, roomId);
    setState("connecting");
    const Realtime = resolveAbly();
    realtime = new Realtime({
      clientId: id.clientId,
      authCallback: function (_params, callback) { tokenFor({ roomId, mode, displayName: id.displayName }).then(function (result) { callback(null, result.tokenRequest); }).catch(function (error) { callback(error); }); }
    });
    bindConnectionEvents(realtime);
    channel = realtime.channels.get(firstToken.channel);
    try { if (channel.presence && typeof channel.presence.enter === "function") await channel.presence.enter({ clientId: id.clientId, displayName: id.displayName }); } catch (_) {}
    if (subscription) await subscribe(subscription.handler, subscription.eventName);
    return { ok: true, state, roomId, mode, channel: firstToken.channel, identity: id, directPublishAllowed: false, version: VERSION };
  }
  async function subscribe(handler, eventName) {
    if (typeof handler !== "function") throw new Error("LINGOSENTINEL_SUBSCRIBER_REQUIRED");
    const name = clean(eventName || MESSAGE_EVENT);
    subscription = { handler, eventName: name };
    if (!channel) return { ok: true, pending: true };
    try { if (typeof channel.unsubscribe === "function") await channel.unsubscribe(); } catch (_) {}
    await channel.subscribe(name, function (message) { try { handler(message); } catch (_) {} });
    return { ok: true, subscribed: true, eventName: name, channel: active && active.channel };
  }
  async function publish() { throw new Error("LINGOSENTINEL_DIRECT_BROWSER_PUBLISH_DISABLED"); }
  async function disconnect(options) {
    const opts = options && typeof options === "object" ? options : {};
    const prior = active && Object.assign({}, active);
    if (active) active.reconnectExpected = false;
    try { if (channel && channel.presence && typeof channel.presence.leave === "function") await channel.presence.leave(); } catch (_) {}
    try { if (channel && typeof channel.unsubscribe === "function") await channel.unsubscribe(); } catch (_) {}
    try { if (realtime && typeof realtime.close === "function") realtime.close(); } catch (_) {}
    channel = null; realtime = null;
    if (prior) {
      try { await authorizedRequest(API_BASE + "/connections/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: prior.sessionId, clientId: prior.clientId }) }, prior.roomId); } catch (_) {}
      if (opts.leaveRoom === true) { try { await leaveRoom(prior.roomId); } catch (_) {} }
    }
    active = null; activeCredential = ""; setState("closed");
    return { ok: true, state: "closed" };
  }
  function onStateChange(listener) { if (typeof listener === "function") stateListeners.add(listener); return function () { stateListeners.delete(listener); }; }
  function getState() { return { state, active: active ? Object.assign({}, active) : null, directPublishAllowed: false, version: VERSION }; }
  function isConnected() { return state === "connected" && !!active; }

  const client = Object.freeze({ version: VERSION, messageEvent: MESSAGE_EVENT, createRoom, joinRoom, leaveRoom, getRoom, getParticipants, connect, subscribe, publish, disconnect, authorizedRequest, onStateChange, getState, isConnected });
  globalScope.LingoSentinelPublicRealtimeClient = client;
  if (typeof module !== "undefined" && module.exports) module.exports = client;
})(typeof window !== "undefined" ? window : globalThis);

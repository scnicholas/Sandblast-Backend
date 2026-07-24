"use strict";

/**
 * Browser-safe Layers 3-4 realtime client.
 * Requires the Ably browser SDK to be loaded as window.Ably.
 * Never receives or stores the Ably root API key.
 */
(function attachLingoSentinelPublicRealtimeClient(globalScope) {
  const API_BASE = "/api/lingosentinel";
  const VERSION = "lingosentinel.publicRealtimeClient/4.0-rooms-lifecycle";
  let realtime = null;
  let channel = null;
  let active = null;
  let state = "initialized";
  let subscriptionHandler = null;
  const stateListeners = new Set();

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function endpoint(value, fallback) {
    const text = clean(value || fallback);
    if (/\/internal\/lingosentinel\//i.test(text)) throw new Error("LINGOSENTINEL_INTERNAL_ROUTE_BLOCKED");
    return text || fallback;
  }
  async function readJson(response) { try { return await response.json(); } catch (_) { return null; } }
  async function request(url, options) {
    const response = await fetch(endpoint(url, url), Object.assign({ credentials: "omit", cache: "no-store" }, options || {}));
    const data = await readJson(response);
    if (!response.ok || !data || data.ok !== true) {
      const error = new Error(clean(data && ((data.errors && data.errors[0]) || data.error)) || "LINGOSENTINEL_REALTIME_REQUEST_FAILED");
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }
  function baseClient() {
    return globalScope.LingoSentinelPublicClient || globalScope.LingoSentinelPublicTranslationClient || null;
  }
  function identity(options) {
    const client = baseClient();
    if (!client || typeof client.getOrCreateIdentity !== "function" || typeof client.getOrCreateSessionId !== "function") {
      throw new Error("LINGOSENTINEL_IDENTITY_CLIENT_UNAVAILABLE");
    }
    const id = client.getOrCreateIdentity(options || {});
    return Object.assign({}, id, { sessionId: client.getOrCreateSessionId() });
  }
  function payloadWithIdentity(payload, options) {
    const id = identity(options);
    return Object.assign({}, payload || {}, {
      clientId: id.clientId,
      sessionId: id.sessionId,
      displayName: id.displayName
    });
  }
  function setState(next, details) {
    state = clean(next || state) || state;
    const event = Object.freeze({ state, details: details || null, at: new Date().toISOString(), active: active ? Object.assign({}, active) : null });
    stateListeners.forEach(function (listener) { try { listener(event); } catch (_) {} });
    return event;
  }
  async function reportState(next, details) {
    const event = setState(next, details);
    if (!active || !active.sessionId) return event;
    try {
      await request(API_BASE + "/connections/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: active.sessionId, clientId: active.clientId, state: next, errorCode: clean(details && (details.code || details.errorCode)), status: details && details.statusCode })
      });
    } catch (_) {}
    return event;
  }
  async function createRoom(input, options) {
    const body = payloadWithIdentity(input || {}, options);
    return request(API_BASE + "/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  async function joinRoom(roomId, options) {
    const body = payloadWithIdentity({}, options);
    return request(API_BASE + "/rooms/" + encodeURIComponent(clean(roomId)) + "/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  async function leaveRoom(roomId, options) {
    const body = payloadWithIdentity({}, options);
    return request(API_BASE + "/rooms/" + encodeURIComponent(clean(roomId)) + "/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  async function getRoom(roomId, options) {
    const id = identity(options);
    const query = "?clientId=" + encodeURIComponent(id.clientId) + "&sessionId=" + encodeURIComponent(id.sessionId);
    return request(API_BASE + "/rooms/" + encodeURIComponent(clean(roomId)) + query);
  }
  async function getParticipants(roomId, options) {
    const id = identity(options);
    const query = "?clientId=" + encodeURIComponent(id.clientId) + "&sessionId=" + encodeURIComponent(id.sessionId);
    return request(API_BASE + "/rooms/" + encodeURIComponent(clean(roomId)) + "/participants" + query);
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
    const result = await client.requestRealtimeToken({ mode: config.mode, roomId: config.roomId, displayName: config.displayName });
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
    await request(API_BASE + "/connections/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(active)
    });
    setState("connecting");
    const Realtime = resolveAbly();
    realtime = new Realtime({
      clientId: id.clientId,
      authCallback: function (_params, callback) {
        tokenFor({ roomId, mode, displayName: id.displayName }).then(function (result) { callback(null, result.tokenRequest); }).catch(function (error) { callback(error); });
      }
    });
    bindConnectionEvents(realtime);
    channel = realtime.channels.get(firstToken.channel);
    try {
      if (channel.presence && typeof channel.presence.enter === "function") {
        await channel.presence.enter({ clientId: id.clientId, displayName: id.displayName });
      }
    } catch (_) {}
    if (subscriptionHandler) await subscribe(subscriptionHandler);
    return { ok: true, state, roomId, mode, channel: firstToken.channel, identity: id, version: VERSION };
  }
  async function subscribe(handler) {
    if (typeof handler !== "function") throw new Error("LINGOSENTINEL_SUBSCRIBER_REQUIRED");
    subscriptionHandler = handler;
    if (!channel) return { ok: true, pending: true };
    try { if (typeof channel.unsubscribe === "function") await channel.unsubscribe(); } catch (_) {}
    await channel.subscribe(function (message) { try { handler(message); } catch (_) {} });
    return { ok: true, subscribed: true, channel: active && active.channel };
  }
  async function publish(name, data) {
    if (!channel || state !== "connected") throw new Error("LINGOSENTINEL_REALTIME_NOT_CONNECTED");
    await channel.publish(clean(name || "LINGOSENTINEL_EVENT"), data || {});
    return { ok: true, channel: active.channel, publishedAt: new Date().toISOString() };
  }
  async function disconnect(options) {
    const opts = options && typeof options === "object" ? options : {};
    const prior = active && Object.assign({}, active);
    if (active) active.reconnectExpected = false;
    try { if (channel && channel.presence && typeof channel.presence.leave === "function") await channel.presence.leave(); } catch (_) {}
    try { if (channel && typeof channel.unsubscribe === "function") await channel.unsubscribe(); } catch (_) {}
    try { if (realtime && typeof realtime.close === "function") realtime.close(); } catch (_) {}
    channel = null; realtime = null;
    if (prior) {
      try { await request(API_BASE + "/connections/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: prior.sessionId, clientId: prior.clientId }) }); } catch (_) {}
      if (opts.leaveRoom === true) { try { await leaveRoom(prior.roomId); } catch (_) {} }
    }
    active = null;
    setState("closed");
    return { ok: true, state: "closed" };
  }
  function onStateChange(listener) { if (typeof listener === "function") stateListeners.add(listener); return function () { stateListeners.delete(listener); }; }
  function getState() { return { state, active: active ? Object.assign({}, active) : null, version: VERSION }; }

  const client = Object.freeze({ version: VERSION, createRoom, joinRoom, leaveRoom, getRoom, getParticipants, connect, subscribe, publish, disconnect, onStateChange, getState });
  globalScope.LingoSentinelPublicRealtimeClient = client;
  if (typeof module !== "undefined" && module.exports) module.exports = client;
})(typeof window !== "undefined" ? window : globalThis);

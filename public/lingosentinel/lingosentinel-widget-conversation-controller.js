"use strict";

(function attachLingoSentinelWidgetConversationController(globalScope) {
  const VERSION = "lingosentinel.widgetConversationController/7.0-english-relay";
  function resolve(value) {
    if (!value) return null;
    if (typeof value === "string" && globalScope.document) return globalScope.document.querySelector(value);
    return value;
  }
  function create(options) {
    const opts = options && typeof options === "object" ? options : {};
    const form = resolve(opts.form);
    const input = resolve(opts.input);
    const sendButton = resolve(opts.sendButton);
    const messages = resolve(opts.messages);
    const status = resolve(opts.status);
    const messageClient = opts.messageClient || globalScope.LingoSentinelPublicMessageClient;
    const receiver = opts.receiver || globalScope.LingoSentinelPublicMessageReceiver;
    const renderPolicy = opts.renderPolicy || globalScope.LingoSentinelMessageRenderPolicy;
    const realtime = opts.realtimeClient || globalScope.LingoSentinelPublicRealtimeClient;
    let destroyed = false;
    let removeState = null;

    function setStatus(text, state) {
      if (status) { status.textContent = String(text || ""); status.setAttribute("data-state", String(state || "")); }
      if (sendButton) sendButton.disabled = state !== "connected";
    }
    function renderMessage(message) {
      if (destroyed) return;
      if (typeof opts.onMessage === "function") opts.onMessage(message);
      else if (messages && renderPolicy && typeof renderPolicy.render === "function") renderPolicy.render(messages, message, opts.renderOptions);
    }
    async function submit(event) {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (destroyed || !messageClient || typeof messageClient.send !== "function") return false;
      const text = input ? input.value : "";
      if (!String(text || "").trim()) return false;
      if (sendButton) sendButton.disabled = true;
      const result = await messageClient.send({ roomId: opts.roomId, mode: opts.mode || "group_room", text: text });
      if (result && result.ok === true) { if (input) input.value = ""; }
      else setStatus(result && result.error || "Message failed", "failed");
      if (sendButton && realtime && typeof realtime.isConnected === "function") sendButton.disabled = !realtime.isConnected();
      return !!(result && result.ok);
    }
    async function start() {
      if (!realtime || !receiver) throw new Error("LINGOSENTINEL_CONVERSATION_DEPENDENCY_UNAVAILABLE");
      const current = realtime.getState();
      const active = current && current.active;
      if (!active) throw new Error("LINGOSENTINEL_REALTIME_CONTEXT_REQUIRED");
      if (opts.roomId && opts.roomId !== active.roomId) throw new Error("LINGOSENTINEL_CONVERSATION_ROOM_MISMATCH");
      if (form && typeof form.addEventListener === "function") form.addEventListener("submit", submit);
      else if (sendButton && typeof sendButton.addEventListener === "function") sendButton.addEventListener("click", submit);
      removeState = realtime.onStateChange(function (event) { setStatus(event.state === "connected" ? "Connected" : event.state, event.state); });
      setStatus(current.state === "connected" ? "Connected" : current.state, current.state);
      await receiver.start({ realtimeClient: realtime, roomId: active.roomId, clientId: active.clientId, onMessage: renderMessage });
      return { ok: true, roomId: active.roomId, version: VERSION };
    }
    function destroy() {
      destroyed = true;
      if (form && typeof form.removeEventListener === "function") form.removeEventListener("submit", submit);
      else if (sendButton && typeof sendButton.removeEventListener === "function") sendButton.removeEventListener("click", submit);
      if (typeof removeState === "function") removeState();
      if (receiver && typeof receiver.stop === "function") receiver.stop();
      return true;
    }
    return Object.freeze({ version: VERSION, start, destroy, submit, renderMessage, englishRelayOnly: true });
  }
  const controller = Object.freeze({ version: VERSION, create });
  globalScope.LingoSentinelWidgetConversationController = controller;
  if (typeof module !== "undefined" && module.exports) module.exports = controller;
})(typeof window !== "undefined" ? window : globalThis);

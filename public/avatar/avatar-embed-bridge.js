// avatar-embed-bridge.js
"use strict";

(function(){
  if (!window.NyxAvatarBridge) return;

  function post(type, payload){
    try { window.parent && window.parent.postMessage({ type, payload }, "*"); } catch(_){}
  }

  window.addEventListener("message", (ev) => {
    const msg = ev && ev.data ? ev.data : null;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "NYX_CONSCIOUSNESS") {
      window.NyxAvatarBridge.applyConsciousness(msg.payload || {});
    }
    if (msg.type === "NYX_SAY") {
      window.NyxAvatarBridge.speakText((msg.payload && msg.payload.text) || "");
    }
    if (msg.type === "NYX_PRESENCE") {
      const p = (msg.payload && msg.payload.presence) || "";
      if (p === "idle" || p === "listening") window.NyxAvatarBridge.state.presence = p;
    }
  });

  post("NYX_AVATAR_READY", { at: Date.now() });

  // optional heartbeat
  setInterval(() => {
    const s = window.NyxAvatarBridge.state || {};
    post("NYX_AVATAR_STATE", {
      at: Date.now(),
      presence: s.presence,
      stage: s.stage,
      dominance: s.dominance,
      velvet: !!s.velvet
    });
  }, 1500);
})();

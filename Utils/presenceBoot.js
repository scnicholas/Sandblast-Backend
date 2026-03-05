/* /utils/presenceBoot.js
   Nyx Presence Greeting Layer (page-load)
   - Fires once per session
   - Safe: no dependency on chatEngine
   - Optional voice + subtitle hook
*/

(function () {
  const KEY = "nyx_presence_greeted_v1";
  const NOW = Date.now();

  function safeGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  function emit(evt, detail) {
    try { window.dispatchEvent(new CustomEvent(evt, { detail })); } catch (e) {}
  }

  function greetText() {
    // You can A/B these later—keep it short for now.
    return "Hello — welcome to Sandblast. I’m Nyx. Want me to show you around?";
  }

  function boot() {
    if (safeGet(KEY)) return;
    safeSet(KEY, String(NOW));

    const text = greetText();

    // 1) Show subtitle/caption (UI can listen for this)
    emit("nyx:presence:caption", { text, ts: NOW });

    // 2) Optional voice (UI/back-end can listen for this)
    emit("nyx:presence:speak", { text, ts: NOW, mode: "presence" });

    // 3) Optional: activate a soft "awake" state for avatar
    emit("nyx:presence:awake", { ts: NOW });
  }

  // Run after DOM is ready (avoid racing the page UI)
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(boot, 250);
  } else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 250));
  }
})();

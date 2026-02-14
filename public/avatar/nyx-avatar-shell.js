/* nyx-avatar-shell.js
 *
 * Nyx Avatar Shell — DOM renderer (no frameworks)
 * v1.3.0 (HERO AVATAR SUPPORT + VISIBILITY AWARE DRIFT + AESTHETIC HARDENING)
 *
 * Contract:
 *   window.NyxAvatarShell.mount(mountEl[, opts]) -> instance
 *
 * Back-compat helpers exposed (safe no-ops if unused by bridge/controller):
 *   window.NyxAvatarShell.applyDirective(d)
 *   window.NyxAvatarShell.setPresence(p)
 *   window.NyxAvatarShell.setVelvet(bool)
 *   window.NyxAvatarShell.setAmp(n)
 *   window.NyxAvatarShell.triggerSettle()
 *
 * New (optional, non-breaking):
 *   window.NyxAvatarShell.setStage(stage)
 *   window.NyxAvatarShell.setAnimSet(name)
 *
 * Notes:
 * - Designed to mount into your existing avatar-host.html (#nyxShellMount).
 * - Doesn’t assume anything about avatar-controller.js / avatar-bridge.js; it’s permissive.
 * - This shell can render:
 *     (A) Abstract “presence” layers (default, asset-free)
 *     (B) Hero avatar image (face+shoulders) if opts.heroSrc is provided
 * - Drift is tiny, non-looped random-walk and pauses when tab is hidden.
 */

(function () {
  "use strict";

  const SHELL_VERSION = "NyxAvatarShell v1.3.0";

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  // -----------------------------
  // Style injection (idempotent)
  // -----------------------------
  const STYLE_ID = "nyx-avatar-shell-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
/* ===== Nyx Avatar Shell (v1.3.0) ===== */
:root{
  /* You can override these from avatar.css or host page */
  --nyx-shell-accent: rgba(140,0,35,0.85);
  --nyx-shell-ink: rgba(255,255,255,0.92);
  --nyx-shell-cyan: rgba(120,190,255,0.85);

  /* Shell internal dials (avatar-host.html may also set these) */
  --nyx-shell-amp: 0.10;          /* 0..1 */
  --nyx-shell-velvet: 0;          /* 0/1 */
  --nyx-shell-dom: 0.55;          /* 0..1 */
  --nyx-shell-driftX: 0px;        /* set by JS micro drift */
  --nyx-shell-driftY: 0px;
  --nyx-shell-glowTight: 1.0;     /* 0.7..1.2 */
  --nyx-shell-focus: 1.0;         /* 0.95..1.05 */
  --nyx-shell-settle: 0;          /* transient */
}

.nyxShell{
  position:absolute;
  inset:0;
  overflow:hidden;

  /* Let host decide radius; we mirror it so the shell looks integrated */
  border-radius: inherit;

  transform: translate3d(var(--nyx-shell-driftX), var(--nyx-shell-driftY), 0);
  will-change: transform, filter, opacity;
  filter: saturate(var(--nyx-shell-focus)) contrast(1.03);
  user-select:none;
  -webkit-user-select:none;

  /* Soft “glass” baseline */
  background:
    radial-gradient(1200px 900px at 50% 40%, rgba(255,255,255,0.035) 0%, transparent 55%),
    radial-gradient(900px 720px at 50% 70%, rgba(0,0,0,0.45) 0%, transparent 62%);
}

.nyxShell * { box-sizing:border-box; }

.nyxLayer{
  position:absolute;
  inset:-24px;
  pointer-events:none;
}

/* -----------------------------
   Abstract presence layers
----------------------------- */
.nyxGlow{
  background:
    radial-gradient(420px 320px at 50% 46%,
      rgba(255,255,255, calc(0.08 * var(--nyx-shell-glowTight))) 0%,
      rgba(255,255,255, 0.03) 36%,
      transparent 62%),
    radial-gradient(560px 420px at 50% 52%,
      rgba(140,0,35, calc(0.14 + 0.18*var(--nyx-shell-velvet))) 0%,
      rgba(140,0,35, 0.06) 40%,
      transparent 70%),
    radial-gradient(900px 720px at 50% 70%,
      rgba(0,0,0,0.30) 0%,
      transparent 60%);
  opacity: 0.92;
  filter: blur(calc(10px - 3px*var(--nyx-shell-glowTight)));
}

/* Halo rings (subtle authority) */
.nyxRings{
  background:
    radial-gradient(closest-side at 50% 50%,
      transparent 62%,
      rgba(255,255,255,0.07) 62.5%,
      transparent 64%),
    radial-gradient(closest-side at 50% 50%,
      transparent 70%,
      rgba(140,0,35,0.10) 70.5%,
      transparent 72.5%),
    radial-gradient(closest-side at 50% 50%,
      transparent 79%,
      rgba(255,255,255,0.04) 79.5%,
      transparent 81%);
  opacity: 0.85;
  transform: scale(calc(1.0 + 0.02*var(--nyx-shell-amp)));
}

/* “Iris” focal center (reads as attention) */
.nyxIris{
  inset: 0;
  background:
    radial-gradient(220px 220px at 50% 48%,
      rgba(255,255,255,0.10) 0%,
      rgba(255,255,255,0.04) 38%,
      rgba(140,0,35,0.10) 54%,
      transparent 74%),
    radial-gradient(120px 120px at 50% 48%,
      rgba(140,0,35,0.26) 0%,
      rgba(140,0,35,0.10) 40%,
      transparent 70%);
  mix-blend-mode: screen;
  opacity: 0.78;
  transform: translateY(calc(-2px * var(--nyx-shell-dom)));
}

/* Grid whisper (intelligence texture) */
.nyxGrid{
  opacity: 0.22;
  background-image:
    linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(420px 320px at 50% 52%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0) 70%);
}

/* Fine noise (premium, not gritty) */
.nyxNoise{
  opacity: 0.10;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
  background-size: 160px 160px;
  mix-blend-mode: overlay;
}

/* Subtle vignette */
.nyxVignette{
  background: radial-gradient(900px 700px at 50% 50%, transparent 45%, rgba(0,0,0,0.58) 85%);
  opacity: 0.85;
}

/* -----------------------------
   Hero avatar image (optional)
----------------------------- */
.nyxHeroWrap{
  position:absolute;
  inset:0;
  display:flex;
  align-items:center;
  justify-content:center;
  padding: clamp(14px, 4.2vw, 22px);
  pointer-events:none;
  z-index: 8;
}

.nyxHero{
  width: min(86%, 420px);
  max-height: 92%;
  height: auto;
  object-fit: contain;
  display:block;

  /* “Neon premium” */
  filter:
    drop-shadow(0 18px 60px rgba(0,0,0,0.55))
    drop-shadow(0 0 26px rgba(120,190,255,0.18))
    drop-shadow(0 0 22px rgba(140,0,35,0.10));
  transform: translateY(calc(-6px + (-2px * var(--nyx-shell-dom))));
  opacity: 0.96;
  will-change: transform, filter, opacity;
  transition: transform 240ms cubic-bezier(.2,.8,.2,1), filter 240ms cubic-bezier(.2,.8,.2,1), opacity 200ms ease;
}

/* Presence modulation */
.nyxShell[data-presence="idle"]{
  --nyx-shell-focus: 1.00;
  --nyx-shell-glowTight: 1.00;
}
.nyxShell[data-presence="listening"]{
  --nyx-shell-focus: 1.02;
  --nyx-shell-glowTight: 1.12;
}
.nyxShell[data-presence="thinking"]{
  --nyx-shell-focus: 0.99;
  --nyx-shell-glowTight: 0.92;
}
.nyxShell[data-presence="speaking"]{
  --nyx-shell-focus: 1.015;
  --nyx-shell-glowTight: 1.06;
}
.nyxShell[data-presence="error"]{
  --nyx-shell-focus: 0.97;
  --nyx-shell-glowTight: 0.90;
  filter: saturate(0.95) contrast(1.07);
}

/* When hero is present, keep abstract layers softer (avoid “busy”) */
.nyxShell[data-hero="1"] .nyxGrid{ opacity: 0.14; }
.nyxShell[data-hero="1"] .nyxRings{ opacity: 0.72; }
.nyxShell[data-hero="1"] .nyxIris{ opacity: 0.62; }

/* Speaking: tiny glow push on hero */
.nyxShell[data-presence="speaking"] .nyxHero{
  filter:
    drop-shadow(0 18px 60px rgba(0,0,0,0.55))
    drop-shadow(0 0 28px rgba(120,190,255,0.24))
    drop-shadow(0 0 26px rgba(140,0,35,0.14));
}

/* Sentence-end “settle” (authority punctuation) */
.nyxShell.nyxSettle .nyxRings{
  transition: transform 180ms cubic-bezier(.2,.9,.2,1);
  transform: scale(0.996);
}
.nyxShell.nyxSettle .nyxIris{
  transition: transform 180ms cubic-bezier(.2,.9,.2,1);
  transform: translateY(calc(-1px * var(--nyx-shell-dom)));
}
.nyxShell.nyxSettle .nyxHero{
  transform: translateY(calc(-5px + (-2px * var(--nyx-shell-dom))));
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce){
  .nyxShell{ transform: none !important; }
  .nyxHero{ transition: none !important; }
}
`;
    document.head.appendChild(st);
  }

  // -----------------------------
  // Micro drift (non-looped) + visibility aware
  // -----------------------------
  function createDriftController(root) {
    let raf = 0;
    let lastT = 0;

    // random-walk target (tiny)
    let tx = 0, ty = 0;
    let x = 0, y = 0;

    // drift personality
    const MAX_IDLE = 0.55; // px
    const MAX_LISTEN = 0.35;
    const MAX_THINK = 0.20;
    const MAX_SPEAK = 0.10;

    // how often to retarget
    let nextRetargetAt = 0;

    function maxForPresence(p) {
      if (p === "listening") return MAX_LISTEN;
      if (p === "thinking") return MAX_THINK;
      if (p === "speaking") return MAX_SPEAK;
      if (p === "error") return 0.0;
      return MAX_IDLE;
    }

    function retarget(p) {
      const m = maxForPresence(p);
      // pick a new tiny target
      tx = (Math.random() * 2 - 1) * m;
      ty = (Math.random() * 2 - 1) * m;
      // next retarget: slow, non-looped
      nextRetargetAt = performance.now() + (2400 + Math.random() * 2600);
    }

    function tick(t) {
      if (!lastT) lastT = t;
      const dt = Math.min(60, t - lastT);
      lastT = t;

      const p = root.getAttribute("data-presence") || "idle";
      if (t >= nextRetargetAt) retarget(p);

      // authority: slow approach; less twitch
      const k = 1 - Math.pow(0.0015, dt); // smoothing
      x += (tx - x) * k;
      y += (ty - y) * k;

      root.style.setProperty("--nyx-shell-driftX", x.toFixed(2) + "px");
      root.style.setProperty("--nyx-shell-driftY", y.toFixed(2) + "px");

      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (raf) return;
      nextRetargetAt = 0;
      lastT = 0;
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function onVis() {
      // pause drift when hidden to save battery + avoid jitter on return
      if (document.hidden) stop();
      else start();
    }

    // Attach once per controller
    document.addEventListener("visibilitychange", onVis, { passive: true });

    return { start, stop, retarget };
  }

  // -----------------------------
  // Shell instance
  // -----------------------------
  function createShell(mountEl, opts) {
    ensureStyle();

    const cfg = (opts && typeof opts === "object") ? opts : {};

    const root = document.createElement("div");
    root.className = "nyxShell";
    root.setAttribute("data-presence", "idle");
    root.setAttribute("data-version", SHELL_VERSION);
    root.setAttribute("data-hero", "0");

    // Layers (order matters)
    const glow = document.createElement("div");
    glow.className = "nyxLayer nyxGlow";

    const rings = document.createElement("div");
    rings.className = "nyxLayer nyxRings";

    const iris = document.createElement("div");
    iris.className = "nyxLayer nyxIris";

    const grid = document.createElement("div");
    grid.className = "nyxLayer nyxGrid";

    const noise = document.createElement("div");
    noise.className = "nyxLayer nyxNoise";

    const vig = document.createElement("div");
    vig.className = "nyxLayer nyxVignette";

    root.appendChild(glow);
    root.appendChild(rings);
    root.appendChild(iris);
    root.appendChild(grid);
    root.appendChild(noise);
    root.appendChild(vig);

    // Optional hero layer (face+shoulders)
    let heroWrap = null;
    let heroImg = null;

    function enableHero(src) {
      const s = String(src || "").trim();
      if (!s) return false;

      if (!heroWrap) {
        heroWrap = document.createElement("div");
        heroWrap.className = "nyxHeroWrap";
        heroImg = document.createElement("img");
        heroImg.className = "nyxHero";
        heroImg.alt = "Nyx";
        heroImg.decoding = "async";
        heroImg.loading = "eager"; // we want presence immediately in widget
        heroWrap.appendChild(heroImg);
        root.appendChild(heroWrap);
      }

      root.setAttribute("data-hero", "1");
      heroImg.src = s;

      // If asset fails, fail-open to abstract layers (do not break UI)
      heroImg.onerror = function () {
        try { root.setAttribute("data-hero", "0"); } catch (_) {}
        try {
          if (heroWrap && heroWrap.parentNode) heroWrap.parentNode.removeChild(heroWrap);
        } catch (_) {}
        heroWrap = null;
        heroImg = null;
      };

      return true;
    }

    // Mount
    while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild);
    mountEl.appendChild(root);

    // Drift controller
    const drift = createDriftController(root);
    // respect reduced motion
    const prefersReduced = (() => {
      try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
      catch (_) { return false; }
    })();
    if (!prefersReduced) drift.start();

    // State
    const state = {
      presence: "idle",
      amp: 0.10,
      velvet: false,
      dom: 0.55,
      stage: "",
      animSet: "",
      hero: "",
    };

    function setPresence(p) {
      const v =
        p === "speaking" ? "speaking" :
        p === "listening" ? "listening" :
        p === "thinking" ? "thinking" :
        p === "error" ? "error" :
        "idle";

      state.presence = v;
      root.setAttribute("data-presence", v);
      // nudge drift to reweight on mode changes
      try { drift.retarget(v); } catch (_) {}
    }

    function setAmp(a) {
      const v = clamp(isNum(a) ? a : 0, 0, 1);
      state.amp = v;
      root.style.setProperty("--nyx-shell-amp", String(v.toFixed(3)));
    }

    function setVelvet(on) {
      state.velvet = !!on;
      root.style.setProperty("--nyx-shell-velvet", state.velvet ? "1" : "0");
    }

    function setDominance(d) {
      const v = clamp(isNum(d) ? d : 0.55, 0, 1);
      state.dom = v;
      root.style.setProperty("--nyx-shell-dom", String(v.toFixed(3)));
    }

    function setStage(stage) {
      const s = String(stage || "").trim().toLowerCase();
      state.stage = s;
      // stage is optional; exposed for host/diagnostics styling
      if (s) root.setAttribute("data-stage", s);
      else root.removeAttribute("data-stage");
    }

    function setAnimSet(name) {
      const s = String(name || "").trim().toLowerCase();
      state.animSet = s;
      if (s) root.setAttribute("data-anim", s);
      else root.removeAttribute("data-anim");
    }

    function setHero(src) {
      const s = String(src || "").trim();
      state.hero = s;
      if (!s) return;
      enableHero(s);
    }

    function triggerSettle() {
      // One-shot class; no loops.
      root.classList.add("nyxSettle");
      setTimeout(() => root.classList.remove("nyxSettle"), 190);
    }

    function applyDirective(d) {
      // Extremely permissive; supports multiple shapes
      if (!d || typeof d !== "object") return;

      // Presence priority: direct fields, then nested
      const p =
        d.presence ||
        (d.payload && d.payload.presence) ||
        d.mode ||
        (d.ui && d.ui.presence);

      if (p) setPresence(String(p));

      // Amp: can be d.amp or d.payload.amp etc.
      const a =
        (isNum(d.amp) ? d.amp : null) ??
        (d.payload && isNum(d.payload.amp) ? d.payload.amp : null) ??
        (d.ui && isNum(d.ui.amp) ? d.ui.amp : null);

      if (a != null) setAmp(a);

      // Velvet
      const v =
        (typeof d.velvet === "boolean" ? d.velvet : null) ??
        (d.payload && typeof d.payload.velvet === "boolean" ? d.payload.velvet : null) ??
        (d.ui && typeof d.ui.velvet === "boolean" ? d.ui.velvet : null);
      if (v != null) setVelvet(v);

      // Dominance (optional)
      const dom =
        (isNum(d.dominance) ? d.dominance : null) ??
        (isNum(d.dom) ? d.dom : null) ??
        (d.payload && isNum(d.payload.dominance) ? d.payload.dominance : null);
      if (dom != null) setDominance(dom);

      // Stage (optional)
      const st =
        (typeof d.stage === "string" ? d.stage : null) ??
        (d.payload && typeof d.payload.stage === "string" ? d.payload.stage : null) ??
        (d.ui && typeof d.ui.stage === "string" ? d.ui.stage : null);
      if (st != null) setStage(st);

      // Anim set (optional)
      const an =
        (typeof d.animSet === "string" ? d.animSet : null) ??
        (d.payload && typeof d.payload.animSet === "string" ? d.payload.animSet : null) ??
        (d.ui && typeof d.ui.animSet === "string" ? d.ui.animSet : null);
      if (an != null) setAnimSet(an);

      // Hero (optional): allow directive to swap hero image live
      const hero =
        (typeof d.heroSrc === "string" ? d.heroSrc : null) ??
        (d.payload && typeof d.payload.heroSrc === "string" ? d.payload.heroSrc : null) ??
        (d.ui && typeof d.ui.heroSrc === "string" ? d.ui.heroSrc : null);
      if (hero) setHero(hero);

      // Sentence-end settle hint (optional)
      if (d.settle === true || (d.ui && d.ui.settle === true)) triggerSettle();
    }

    function destroy() {
      try { drift.stop(); } catch (_) {}
      if (root && root.parentNode) root.parentNode.removeChild(root);
    }

    // Default tuning
    if (cfg) {
      if (cfg.presence) setPresence(cfg.presence);
      if (isNum(cfg.amp)) setAmp(cfg.amp);
      if (typeof cfg.velvet === "boolean") setVelvet(cfg.velvet);
      if (isNum(cfg.dominance)) setDominance(cfg.dominance);
      if (cfg.stage) setStage(cfg.stage);
      if (cfg.animSet) setAnimSet(cfg.animSet);
      if (cfg.heroSrc) setHero(cfg.heroSrc);
    }

    return {
      version: SHELL_VERSION,
      el: root,
      state,
      setPresence,
      setAmp,
      setVelvet,
      setDominance,
      setStage,
      setAnimSet,
      setHero,
      triggerSettle,
      applyDirective,
      destroy,
    };
  }

  // -----------------------------
  // Singleton public API
  // -----------------------------
  let _instance = null;

  function mount(mountEl, opts) {
    if (!mountEl || !(mountEl instanceof Element)) {
      throw new Error("NyxAvatarShell.mount requires a DOM Element mount target.");
    }
    // Destroy prior instance if remounting
    try { if (_instance && _instance.destroy) _instance.destroy(); } catch (_) {}
    _instance = createShell(mountEl, opts);
    return _instance;
  }

  function applyDirective(d) {
    if (_instance && _instance.applyDirective) _instance.applyDirective(d);
  }
  function setPresence(p) {
    if (_instance && _instance.setPresence) _instance.setPresence(p);
  }
  function setVelvet(v) {
    if (_instance && _instance.setVelvet) _instance.setVelvet(!!v);
  }
  function setAmp(a) {
    if (_instance && _instance.setAmp) _instance.setAmp(a);
  }
  function triggerSettle() {
    if (_instance && _instance.triggerSettle) _instance.triggerSettle();
  }
  function setStage(stage) {
    if (_instance && _instance.setStage) _instance.setStage(stage);
  }
  function setAnimSet(name) {
    if (_instance && _instance.setAnimSet) _instance.setAnimSet(name);
  }
  function setHero(src) {
    if (_instance && _instance.setHero) _instance.setHero(src);
  }
  function getInstance() { return _instance; }

  // Expose
  window.NyxAvatarShell = {
    version: SHELL_VERSION,
    mount,
    getInstance,
    applyDirective,
    setPresence,
    setVelvet,
    setAmp,
    setStage,
    setAnimSet,
    setHero,
    triggerSettle,
  };
})();

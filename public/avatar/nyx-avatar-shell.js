/* nyx-avatar-shell.js
 *
 * Nyx Avatar Shell — DOM renderer (no frameworks)
 * v1.3.1 (HERO AVATAR SUPPORT + VISIBILITY AWARE DRIFT + AESTHETIC HARDENING + SOLID CANVAS + ISOLATION + HERO FAILOPEN DIAG)
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

  const SHELL_VERSION = "NyxAvatarShell v1.3.1";

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const safeStr = (x) => (x == null ? "" : String(x));

  // -----------------------------
  // Style injection (idempotent)
  // -----------------------------
  const STYLE_ID = "nyx-avatar-shell-style";
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
/* ===== Nyx Avatar Shell (v1.3.1) ===== */
:root{
  --nyx-shell-accent: rgba(140,0,35,0.85);
  --nyx-shell-ink: rgba(255,255,255,0.92);
  --nyx-shell-cyan: rgba(120,190,255,0.85);

  --nyx-shell-amp: 0.10;
  --nyx-shell-velvet: 0;
  --nyx-shell-dom: 0.55;
  --nyx-shell-driftX: 0px;
  --nyx-shell-driftY: 0px;
  --nyx-shell-glowTight: 1.0;
  --nyx-shell-focus: 1.0;
  --nyx-shell-settle: 0;
}

.nyxShell{
  position:absolute;
  inset:0;
  overflow:hidden;
  border-radius: inherit;

  /* CRITICAL: isolate blending from any parent visuals */
  isolation: isolate;

  transform: translate3d(var(--nyx-shell-driftX), var(--nyx-shell-driftY), 0);
  will-change: transform, filter, opacity;
  filter: saturate(var(--nyx-shell-focus)) contrast(1.05);
  user-select:none;
  -webkit-user-select:none;

  /* CRITICAL: hard base canvas so visuals don’t “collapse” into darkness */
  background:
    radial-gradient(1200px 900px at 50% 40%, rgba(255,255,255,0.035) 0%, transparent 55%),
    radial-gradient(900px 720px at 50% 70%, rgba(0,0,0,0.45) 0%, transparent 62%),
    #0b0b10;
}

.nyxShell * { box-sizing:border-box; }

.nyxLayer{
  position:absolute;
  inset:-24px;
  pointer-events:none;
}

/* Abstract presence layers */
.nyxGlow{
  background:
    radial-gradient(420px 320px at 50% 46%,
      rgba(255,255,255, calc(0.10 * var(--nyx-shell-glowTight))) 0%,
      rgba(255,255,255, 0.04) 36%,
      transparent 62%),
    radial-gradient(560px 420px at 50% 52%,
      rgba(140,0,35, calc(0.18 + 0.20*var(--nyx-shell-velvet))) 0%,
      rgba(140,0,35, 0.07) 40%,
      transparent 70%),
    radial-gradient(900px 720px at 50% 70%,
      rgba(0,0,0,0.32) 0%,
      transparent 60%);
  opacity: 0.95;
  filter: blur(calc(9px - 3px*var(--nyx-shell-glowTight)));
}

.nyxRings{
  background:
    radial-gradient(closest-side at 50% 50%,
      transparent 62%,
      rgba(255,255,255,0.08) 62.5%,
      transparent 64%),
    radial-gradient(closest-side at 50% 50%,
      transparent 70%,
      rgba(140,0,35,0.12) 70.5%,
      transparent 72.5%),
    radial-gradient(closest-side at 50% 50%,
      transparent 79%,
      rgba(255,255,255,0.05) 79.5%,
      transparent 81%);
  opacity: 0.88;
  transform: scale(calc(1.0 + 0.02*var(--nyx-shell-amp)));
}

.nyxIris{
  inset: 0;
  background:
    radial-gradient(220px 220px at 50% 48%,
      rgba(255,255,255,0.10) 0%,
      rgba(255,255,255,0.05) 38%,
      rgba(140,0,35,0.12) 54%,
      transparent 74%),
    radial-gradient(120px 120px at 50% 48%,
      rgba(140,0,35,0.28) 0%,
      rgba(140,0,35,0.12) 40%,
      transparent 70%);

  /* softer blending to avoid “washed out / invisible” on dark sites */
  mix-blend-mode: normal;
  opacity: 0.82;
  transform: translateY(calc(-2px * var(--nyx-shell-dom)));
}

.nyxGrid{
  opacity: 0.20;
  background-image:
    linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(420px 320px at 50% 52%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0) 70%);
}

.nyxNoise{
  opacity: 0.10;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
  background-size: 160px 160px;
  mix-blend-mode: overlay;
}

.nyxVignette{
  background: radial-gradient(900px 700px at 50% 50%, transparent 45%, rgba(0,0,0,0.60) 85%);
  opacity: 0.88;
}

/* Hero avatar image (optional) */
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
  filter:
    drop-shadow(0 18px 60px rgba(0,0,0,0.60))
    drop-shadow(0 0 28px rgba(120,190,255,0.20))
    drop-shadow(0 0 26px rgba(140,0,35,0.14));
  transform: translateY(calc(-6px + (-2px * var(--nyx-shell-dom))));
  opacity: 0.98;
  will-change: transform, filter, opacity;
  transition: transform 240ms cubic-bezier(.2,.8,.2,1), filter 240ms cubic-bezier(.2,.8,.2,1), opacity 200ms ease;
}

.nyxShell[data-presence="idle"]{ --nyx-shell-focus: 1.00; --nyx-shell-glowTight: 1.00; }
.nyxShell[data-presence="listening"]{ --nyx-shell-focus: 1.03; --nyx-shell-glowTight: 1.12; }
.nyxShell[data-presence="thinking"]{ --nyx-shell-focus: 1.00; --nyx-shell-glowTight: 0.94; }
.nyxShell[data-presence="speaking"]{ --nyx-shell-focus: 1.02; --nyx-shell-glowTight: 1.07; }
.nyxShell[data-presence="error"]{ --nyx-shell-focus: 0.98; --nyx-shell-glowTight: 0.92; filter: saturate(0.96) contrast(1.06); }

.nyxShell[data-hero="1"] .nyxGrid{ opacity: 0.13; }
.nyxShell[data-hero="1"] .nyxRings{ opacity: 0.74; }
.nyxShell[data-hero="1"] .nyxIris{ opacity: 0.66; }

.nyxShell[data-presence="speaking"] .nyxHero{
  filter:
    drop-shadow(0 18px 60px rgba(0,0,0,0.60))
    drop-shadow(0 0 30px rgba(120,190,255,0.26))
    drop-shadow(0 0 28px rgba(140,0,35,0.18));
}

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

/* Hero fallback badge (only shown if hero fails to load) */
.nyxHeroFail{
  position:absolute;
  left:12px;
  bottom:12px;
  padding:8px 10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.38);
  color: rgba(255,255,255,0.86);
  font: 12px/1.25 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  z-index: 9;
  pointer-events:none;
  max-width: calc(100% - 24px);
  overflow:hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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
    let tx = 0, ty = 0;
    let x = 0, y = 0;

    const MAX_IDLE = 0.55;
    const MAX_LISTEN = 0.35;
    const MAX_THINK = 0.20;
    const MAX_SPEAK = 0.10;

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
      tx = (Math.random() * 2 - 1) * m;
      ty = (Math.random() * 2 - 1) * m;
      nextRetargetAt = performance.now() + (2400 + Math.random() * 2600);
    }

    function tick(t) {
      if (!lastT) lastT = t;
      const dt = Math.min(60, t - lastT);
      lastT = t;

      const p = root.getAttribute("data-presence") || "idle";
      if (t >= nextRetargetAt) retarget(p);

      const k = 1 - Math.pow(0.0015, dt);
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
      if (document.hidden) stop();
      else start();
    }

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

    // --- Hero layer + fail-open diagnostics (never silently disappears) ---
    let heroWrap = null;
    let heroImg = null;
    let heroFail = null;
    let heroAttempt = 0;

    function ensureHeroNodes() {
      if (heroWrap) return;

      heroWrap = document.createElement("div");
      heroWrap.className = "nyxHeroWrap";

      heroImg = document.createElement("img");
      heroImg.className = "nyxHero";
      heroImg.alt = "Nyx";
      heroImg.decoding = "async";
      heroImg.loading = "eager";
      heroWrap.appendChild(heroImg);

      root.appendChild(heroWrap);

      // failure badge (only created once)
      heroFail = document.createElement("div");
      heroFail.className = "nyxHeroFail";
      heroFail.style.display = "none";
      heroFail.textContent = "hero: —";
      root.appendChild(heroFail);

      heroImg.onload = function () {
        try { heroFail.style.display = "none"; } catch (_) {}
        try { root.setAttribute("data-hero", "1"); } catch (_) {}
      };

      heroImg.onerror = function () {
        // IMPORTANT: do NOT remove the nodes; keep evidence.
        try { root.setAttribute("data-hero", "0"); } catch (_) {}
        try {
          if (heroFail) {
            heroFail.style.display = "";
            heroFail.textContent = "hero failed (" + heroAttempt + "): " + safeStr(heroImg && heroImg.src).slice(0, 160);
          }
        } catch (_) {}
        try {
          // loud, but controlled
          console.warn("[NyxAvatarShell] hero image failed to load:", safeStr(heroImg && heroImg.src));
        } catch (_) {}
      };
    }

    function enableHero(src) {
      const s = safeStr(src).trim();
      if (!s) return false;

      ensureHeroNodes();

      heroAttempt += 1;
      root.setAttribute("data-hero", "1"); // optimistic; onerror flips to 0
      heroImg.src = s;

      // show "attempt" badge only if it errors; keep quiet otherwise
      return true;
    }

    // Mount
    while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild);
    mountEl.appendChild(root);

    // Drift controller
    const drift = createDriftController(root);
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
      const s = safeStr(stage).trim().toLowerCase();
      state.stage = s;
      if (s) root.setAttribute("data-stage", s);
      else root.removeAttribute("data-stage");
    }

    function setAnimSet(name) {
      const s = safeStr(name).trim().toLowerCase();
      state.animSet = s;
      if (s) root.setAttribute("data-anim", s);
      else root.removeAttribute("data-anim");
    }

    function setHero(src) {
      const s = safeStr(src).trim();
      state.hero = s;
      if (!s) return;
      enableHero(s);
    }

    function triggerSettle() {
      root.classList.add("nyxSettle");
      setTimeout(() => root.classList.remove("nyxSettle"), 190);
    }

    function applyDirective(d) {
      if (!d || typeof d !== "object") return;

      const p =
        d.presence ||
        (d.payload && d.payload.presence) ||
        d.mode ||
        (d.ui && d.ui.presence);

      if (p) setPresence(String(p));

      const a =
        (isNum(d.amp) ? d.amp : null) ??
        (d.payload && isNum(d.payload.amp) ? d.payload.amp : null) ??
        (d.ui && isNum(d.ui.amp) ? d.ui.amp : null);

      if (a != null) setAmp(a);

      const v =
        (typeof d.velvet === "boolean" ? d.velvet : null) ??
        (d.payload && typeof d.payload.velvet === "boolean" ? d.payload.velvet : null) ??
        (d.ui && typeof d.ui.velvet === "boolean" ? d.ui.velvet : null);
      if (v != null) setVelvet(v);

      const dom =
        (isNum(d.dominance) ? d.dominance : null) ??
        (isNum(d.dom) ? d.dom : null) ??
        (d.payload && isNum(d.payload.dominance) ? d.payload.dominance : null);
      if (dom != null) setDominance(dom);

      const st =
        (typeof d.stage === "string" ? d.stage : null) ??
        (d.payload && typeof d.payload.stage === "string" ? d.payload.stage : null) ??
        (d.ui && typeof d.ui.stage === "string" ? d.ui.stage : null);
      if (st != null) setStage(st);

      const an =
        (typeof d.animSet === "string" ? d.animSet : null) ??
        (d.payload && typeof d.payload.animSet === "string" ? d.payload.animSet : null) ??
        (d.ui && typeof d.ui.animSet === "string" ? d.ui.animSet : null);
      if (an != null) setAnimSet(an);

      const hero =
        (typeof d.heroSrc === "string" ? d.heroSrc : null) ??
        (d.payload && typeof d.payload.heroSrc === "string" ? d.payload.heroSrc : null) ??
        (d.ui && typeof d.ui.heroSrc === "string" ? d.ui.heroSrc : null);
      if (hero) setHero(hero);

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
    try { if (_instance && _instance.destroy) _instance.destroy(); } catch (_) {}
    _instance = createShell(mountEl, opts);
    return _instance;
  }

  function applyDirective(d) { if (_instance && _instance.applyDirective) _instance.applyDirective(d); }
  function setPresence(p) { if (_instance && _instance.setPresence) _instance.setPresence(p); }
  function setVelvet(v) { if (_instance && _instance.setVelvet) _instance.setVelvet(!!v); }
  function setAmp(a) { if (_instance && _instance.setAmp) _instance.setAmp(a); }
  function triggerSettle() { if (_instance && _instance.triggerSettle) _instance.triggerSettle(); }
  function setStage(stage) { if (_instance && _instance.setStage) _instance.setStage(stage); }
  function setAnimSet(name) { if (_instance && _instance.setAnimSet) _instance.setAnimSet(name); }
  function setHero(src) { if (_instance && _instance.setHero) _instance.setHero(src); }
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

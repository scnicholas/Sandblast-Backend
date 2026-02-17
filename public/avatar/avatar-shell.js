// nyx-avatar-shell.js
"use strict";

/**
 * Nyx Avatar Shell (Renderer)
 *
 * v1.1.0 (TRANSPARENT STAGE++++ + NO BLACK PAINT++++ + SAFE OVERLAY COMPAT++++)
 *
 * Why this update:
 * - Your hero PNG is supposed to live on #nyxShellMount (background-image).
 * - The shell must NEVER paint an opaque background that “black-washes” the hero.
 * - The shell must also be safe inside an iframe widget (no layout fighting, no pointer theft).
 *
 * What this does:
 * ✅ Forces root + wrapper backgrounds to transparent (hard).
 * ✅ Uses absolute fill layout so it never pushes UI.
 * ✅ Disables pointer-events so bubble/input stay fully interactive.
 * ✅ Keeps silhouette as a subtle fallback only (does not obscure hero).
 */
(function () {
  function el(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function injectSafetyCSS() {
    // Inject once
    if (document.getElementById("nyxShellSafetyCSS")) return;

    const s = document.createElement("style");
    s.id = "nyxShellSafetyCSS";
    s.textContent = `
      /* === Nyx Shell Safety CSS (do not remove) === */
      #nyxShellMount, #nyxAvatar, .nyx-shell-wrap, .nyx-shell-wrap *{
        background: transparent !important;
      }
      .nyx-shell-wrap{
        position:absolute !important;
        inset:0 !important;
        width:100% !important;
        height:100% !important;
        min-height:0 !important;
        pointer-events:none !important; /* UI overlay must be clickable */
        z-index:1 !important;           /* stays behind overlay */
      }
      /* Fallback silhouette should never “fight” the hero PNG */
      .nyx-shell-wrap .silhouette{
        position:absolute;
        inset:0;
        display:flex;
        align-items:center;
        justify-content:center;
        opacity:.14;                    /* subtle fallback only */
        filter: contrast(1.02) saturate(1.02);
      }
    `;
    document.head.appendChild(s);
  }

  function buildAvatar(root) {
    injectSafetyCSS();

    // IMPORTANT: do not let the shell create/keep any opaque paint
    try {
      root.style.background = "transparent";
      root.style.setProperty("background", "transparent", "important");
      root.style.setProperty("pointer-events", "none");
    } catch (_) {}

    root.innerHTML = "";

    const wrap = el("div", "avatar nyx-shell-wrap mood-calm gaze-soft");
    wrap.setAttribute("aria-label", "Nyx Avatar");
    wrap.style.background = "transparent";
    wrap.style.pointerEvents = "none";

    const sil = el("div", "silhouette");

    const head = el("div", "head");
    const eyeL = el("div", "eye left");
    const pupilL = el("div", "pupil");
    const lidL = el("div", "lid");
    eyeL.appendChild(pupilL);
    eyeL.appendChild(lidL);

    const eyeR = el("div", "eye right");
    const pupilR = el("div", "pupil");
    const lidR = el("div", "lid");
    eyeR.appendChild(pupilR);
    eyeR.appendChild(lidR);

    const mouth = el("div", "mouth");

    head.appendChild(eyeL);
    head.appendChild(eyeR);
    head.appendChild(mouth);

    const shoulders = el("div", "shoulders");

    sil.appendChild(head);
    sil.appendChild(shoulders);

    wrap.appendChild(sil);
    root.appendChild(wrap);

    return { wrap };
  }

  function setVar(node, name, value) {
    // Keep safe numeric/string coercion
    if (value === undefined || value === null) return;
    node.style.setProperty(name, String(value));
  }

  function applyDirective(avatar, d) {
    const wrap = avatar.wrap;
    d = d || {};

    // Transparent enforcement (again) in case any other script tries to paint it
    try {
      wrap.style.background = "transparent";
      wrap.style.pointerEvents = "none";
    } catch (_) {}

    // CSS vars (driven)
    setVar(wrap, "--breath", d.breathRate);
    setVar(wrap, "--motion", d.motionIntensity);
    setVar(wrap, "--blink", d.blinkRate);
    setVar(wrap, "--mouth", d.mouthIntensity);
    setVar(wrap, "--jaw", d.jawBias);
    setVar(wrap, "--gazeWander", d.gazeWander);
    setVar(wrap, "--headTilt", d.headTilt);

    // speaking class
    if (d.speaking) wrap.classList.add("is-speaking");
    else wrap.classList.remove("is-speaking");

    // mood
    wrap.classList.remove("mood-calm", "mood-attentive", "mood-intense");
    wrap.classList.add("mood-" + (d.mood || "calm"));

    // gaze
    wrap.classList.remove("gaze-soft", "gaze-direct", "gaze-away");
    wrap.classList.add("gaze-" + (d.gaze || "soft"));

    // animSet data tag (future mapping)
    wrap.dataset.animset = d.animSet || "";
  }

  // Expose API
  window.NyxAvatarShell = {
    mount(rootEl) {
      const avatar = buildAvatar(rootEl);
      return {
        apply(directive) {
          applyDirective(avatar, directive || {});
        },
      };
    },
  };
})();

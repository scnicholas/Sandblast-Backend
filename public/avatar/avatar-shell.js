// nyx-avatar-shell.js
"use strict";

/**
 * Nyx Avatar Shell (HERO IMG GUARANTEE++++)
 * - Pure renderer
 * - GUARANTEES hero renders by using a real <img> layer (not CSS bg)
 * - Provides setHero / setHeroSrc helpers for host + bridge
 */
(function () {
  function el(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function safeStr(x) {
    return x === null || x === undefined ? "" : String(x);
  }

  const ABS_FALLBACK = "https://sandblast-backend.onrender.com/avatar/assets/nyx-hero.png";
  const REL_FALLBACK = "/avatar/assets/nyx-hero.png";

  function buildAvatar(root) {
    root.innerHTML = "";

    // Stage container
    const stage = el("div", "nyx-stage");
    stage.setAttribute("aria-label", "Nyx Avatar");

    // ✅ Hero image layer (guaranteed paint)
    const heroWrap = el("div", "nyx-hero");
    const heroImg = el("img", "nyx-hero-img");
    heroImg.alt = "Nyx Hero";
    heroImg.decoding = "async";
    heroImg.loading = "eager";
    heroImg.referrerPolicy = "no-referrer";

    // hard fallback chain
    heroImg.onerror = function () {
      // If current src isn't ABS fallback, try ABS
      const cur = safeStr(heroImg.src);
      if (cur.indexOf(ABS_FALLBACK) === -1) {
        heroImg.src = ABS_FALLBACK + "?v=" + Date.now();
        return;
      }
      // then REL fallback
      if (cur.indexOf(REL_FALLBACK) === -1) {
        heroImg.src = REL_FALLBACK + "?v=" + Date.now();
        return;
      }
      // last resort: hide broken img so silhouette can show
      heroImg.style.display = "none";
    };

    heroWrap.appendChild(heroImg);

    // Subtle silhouette fallback (never blocks hero)
    const wrap = el("div", "avatar mood-calm gaze-soft nyx-silhouette");
    const sil = el("div", "silhouette");

    const head = el("div", "head");

    const eyeL = el("div", "eye left");
    eyeL.appendChild(el("div", "pupil"));
    eyeL.appendChild(el("div", "lid"));

    const eyeR = el("div", "eye right");
    eyeR.appendChild(el("div", "pupil"));
    eyeR.appendChild(el("div", "lid"));

    const mouth = el("div", "mouth");

    head.appendChild(eyeL);
    head.appendChild(eyeR);
    head.appendChild(mouth);

    const shoulders = el("div", "shoulders");

    sil.appendChild(head);
    sil.appendChild(shoulders);

    wrap.appendChild(sil);

    // Assemble
    stage.appendChild(heroWrap);
    stage.appendChild(wrap);
    root.appendChild(stage);

    return { stage, heroImg, wrap };
  }

  function setVar(node, name, value) {
    try {
      node.style.setProperty(name, String(value));
    } catch (_) {}
  }

  function applyDirective(avatar, d) {
    d = d || {};
    const wrap = avatar.wrap;

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

    wrap.dataset.animset = d.animSet || "";

    // ✅ hero support
    if (d.heroSrc) {
      setHeroSrc(avatar, d.heroSrc);
    }
  }

  function normalizeHeroSrc(src) {
    src = safeStr(src).trim();
    if (!src) return "";
    if (/^file:\/\//i.test(src)) return "";
    return src;
  }

  function setHeroSrc(avatar, src) {
    try {
      const hero = avatar && avatar.heroImg;
      if (!hero) return;

      src = normalizeHeroSrc(src);
      if (!src) src = ABS_FALLBACK;

      // cache-bust lightly
      const bust = "v=" + Date.now();
      hero.style.display = "";
      hero.src = src + (src.indexOf("?") >= 0 ? "&" : "?") + bust;
    } catch (_) {}
  }

  // Expose API
  window.NyxAvatarShell = {
    mount(rootEl, opts) {
      opts = opts || {};
      const avatar = buildAvatar(rootEl);

      // initial hero
      const initialHero =
        normalizeHeroSrc(opts.heroSrc) ||
        normalizeHeroSrc(opts.hero) ||
        ABS_FALLBACK;

      setHeroSrc(avatar, initialHero);

      return {
        apply(directive) {
          applyDirective(avatar, directive || {});
        },
        setHero(url) {
          setHeroSrc(avatar, url);
        },
        setHeroSrc(url) {
          setHeroSrc(avatar, url);
        },
        get el() {
          return rootEl;
        }
      };
    },
    getInstance() {
      // optional pattern; host may or may not use this
      return null;
    }
  };
})();

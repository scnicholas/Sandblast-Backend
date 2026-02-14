// avatar-shell.js
"use strict";

/**
 * Avatar Shell
 * - Pure renderer: takes directive and updates DOM + CSS vars
 * - No state logic beyond "apply"
 */
(function () {
  function el(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function buildAvatar(root) {
    root.innerHTML = "";

    const wrap = el("div", "avatar mood-calm gaze-soft");
    wrap.setAttribute("aria-label", "Nyx Avatar");

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
    node.style.setProperty(name, String(value));
  }

  function applyDirective(avatar, d) {
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

    // (optional) animSet could map to different assets later; for now we keep it as a data attribute
    wrap.dataset.animset = d.animSet || "";
  }

  // Expose a tiny API
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

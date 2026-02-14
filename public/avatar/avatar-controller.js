// avatar-controller.js
"use strict";

/**
 * Avatar State Controller (Nyx Brain–Body Bridge)
 * (Standalone build: exposes global AvatarController)
 *
 * v0.4.0 (GENERAL GATEWAY UI + 5 CHIP MODEL + MARION-INFORMED GREETING + FAIL-OPEN)
 *  ✅ Keeps v0.3.0 directive engine unchanged in behavior
 *  ✅ Adds UI overlay controller (bubble + chips/actions) (FAIL-OPEN if host UI missing)
 *  ✅ Enforces 5 chips only: general/music/roku/schedule/radio (no "more")
 *  ✅ "General" acts like "More": opens contextual options inside the bubble
 *  ✅ Soft greeting builder using Marion signals (no raw user text stored)
 *  ✅ Emits lightweight events: nyx:lane, nyx:ui
 */

// -------------------------
// utils
// -------------------------
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
function clamp(n, lo, hi, def) {
  const x = Number(n);
  if (!Number.isFinite(x)) return def;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function nowMs() {
  return Date.now();
}
function stablePick(seedStr, arr) {
  const s = safeStr(seedStr);
  if (!arr || !arr.length) return null;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % arr.length;
  return arr[idx];
}

const PRESENCE = Object.freeze(["idle", "listening", "thinking", "speaking"]);
const STAGE = Object.freeze(["boot", "warm", "engaged"]);
const DOMINANCE = Object.freeze(["soft", "neutral", "firm"]);

const DEFAULT_DIRECTIVE = Object.freeze({
  // Contract fields (helpful to shells)
  presence: "idle",
  stage: "warm",
  dominance: "neutral",
  velvet: false,

  animSet: "idle_warm_neutral",
  pose: "head_shoulders",
  mood: "calm",
  gaze: "soft",
  gazeWander: 0.25,
  headTilt: 0.1,
  microNodRate: 0.05,
  breathRate: 0.9,
  motionIntensity: 0.25,
  shoulderRise: 0.15,
  blinkRate: 0.9,
  blinkVariance: 0.35,
  speaking: false,
  mouthIntensity: 0,
  jawBias: 0.4,
  visemeStyle: "amplitude",
  settle: false, // one-shot hint
  stableKey: "",
  updatedAt: 0,
});

function normalizeInput(inp) {
  const x = inp && typeof inp === "object" ? inp : {};
  const presence = PRESENCE.includes(x.presence) ? x.presence : "idle";
  const stage = STAGE.includes(x.stage) ? x.stage : "warm";
  const dominance = DOMINANCE.includes(x.dominance) ? x.dominance : "neutral";
  const velvet = !!x.velvet;

  // speaking truth is a boolean, but presence can also imply it
  const speaking = !!x.speaking || presence === "speaking";
  const amplitude = clamp01(x.amplitude);
  const topic = safeStr(x.topic || "");
  const lane = safeStr(x.lane || "");
  const t = Number.isFinite(Number(x.t)) && Number(x.t) > 0 ? Number(x.t) : nowMs();

  // Optional external settle hint (bridge can pass this)
  const settleHint = !!x.settleHint;

  return { presence, stage, dominance, velvet, speaking, amplitude, topic, lane, t, settleHint };
}

function computeStableKey(s) {
  return [
    s.stage,
    s.presence,
    s.dominance,
    s.velvet ? "v" : "nv",
    s.lane || "-",
    s.topic || "-",
  ].join("|");
}

function mapMood(s) {
  if (s.dominance === "firm" && s.stage === "engaged") return "intense";
  if (s.presence === "listening") return "attentive";
  if (s.presence === "thinking") return "thoughtful";
  return "calm";
}

function baseBreathRate(s) {
  let r = 0.95;
  if (s.stage === "boot") r = 0.9;
  if (s.stage === "engaged") r = 1.03;

  if (s.presence === "thinking") r -= 0.08; // stillness = authority
  if (s.dominance === "soft") r -= 0.05;
  if (s.dominance === "firm") r += 0.05;
  if (s.velvet) r -= 0.08;
  if (s.presence === "speaking") r += 0.04;

  return clamp(r, 0.6, 1.4, 0.95);
}

function baseMotionIntensity(s) {
  let m = 0.22;
  if (s.stage === "boot") m = 0.18;
  if (s.stage === "engaged") m = 0.28;

  if (s.presence === "thinking") m -= 0.07; // deliberate stillness
  if (s.dominance === "soft") m -= 0.03;
  if (s.dominance === "firm") m += 0.05;
  if (s.velvet) m -= 0.03;
  if (s.presence === "listening") m += 0.01;
  if (s.presence === "speaking") m -= 0.02;

  return clamp(m, 0, 1, 0.22);
}

function baseGaze(s) {
  if (s.velvet) return "direct";
  if (s.dominance === "firm" && s.stage === "engaged") return "direct";
  if (s.presence === "listening") return "direct";
  if (s.presence === "thinking") return "direct";
  return "soft";
}

function baseBlinkRate(s) {
  let b = 1.0;
  if (s.stage === "boot") b = 1.1;
  if (s.stage === "engaged") b = 0.95;

  if (s.presence === "thinking") b -= 0.12;
  if (s.velvet) b -= 0.12;
  if (s.presence === "speaking") b += 0.03;

  return clamp(b, 0.55, 1.6, 1.0);
}

function baseGazeWander(s) {
  let g = 0.28;
  if (s.presence === "idle") g = 0.3;
  if (s.presence === "listening") g = 0.22;
  if (s.presence === "thinking") g = 0.12;
  if (s.presence === "speaking") g = 0.18;

  if (s.velvet) g -= 0.08;
  if (s.dominance === "firm") g -= 0.04;

  return clamp(g, 0, 1, 0.25);
}

function mapAnimSet(s, stableKey) {
  const base = `${s.presence}_${s.stage}_${s.dominance}${s.velvet ? "_velvet" : ""}`;
  const variants = ["a", "b", "c"];
  const v = stablePick(stableKey, variants) || "a";

  // speaking sets should be stable (no variant suffix)
  if (s.presence === "speaking") return base;
  return `${base}_${v}`;
}

function speakingOverlay(s) {
  if (!s.speaking) {
    return { speaking: false, mouthIntensity: 0, jawBias: 0.4, visemeStyle: "none" };
  }
  const a = clamp01(s.amplitude);
  const mouth = clamp(a * 0.85 + 0.1, 0, 1, 0);
  let jaw = 0.42;
  if (s.dominance === "soft") jaw = 0.36;
  if (s.dominance === "firm") jaw = 0.5;
  if (s.velvet) jaw -= 0.05;

  return {
    speaking: true,
    mouthIntensity: clamp01(mouth),
    jawBias: clamp(jaw, 0, 1, 0.42),
    visemeStyle: "amplitude",
  };
}

function smoothValue(prev, next, alpha) {
  const a = clamp01(alpha);
  return prev + (next - prev) * a;
}

function smoothDirective(prevDir, nextDir, s) {
  const p = prevDir && typeof prevDir === "object" ? prevDir : {};
  const n = nextDir;

  let alpha = 0.18;
  if (s.velvet) alpha = 0.12;
  if (s.dominance === "firm") alpha = 0.22;
  if (s.presence === "speaking") alpha = 0.26;
  if (s.presence === "thinking") alpha = 0.14;

  const out = { ...n };
  const numericKeys = [
    "gazeWander",
    "headTilt",
    "microNodRate",
    "breathRate",
    "motionIntensity",
    "shoulderRise",
    "blinkRate",
    "blinkVariance",
    "mouthIntensity",
    "jawBias",
  ];

  for (const k of numericKeys) {
    if (typeof n[k] === "number") {
      const pv = typeof p[k] === "number" ? p[k] : n[k];
      out[k] = smoothValue(pv, n[k], alpha);
    }
  }

  return out;
}

function computeDirective(input, prevDirective) {
  const s = normalizeInput(input);
  const stableKey = computeStableKey(s);

  // One-shot settle:
  // - if prior frame was speaking and now isn't, settle.
  // - OR if bridge provides settleHint (audio ended / turn ended).
  const prevSpeaking = !!(prevDirective && prevDirective.speaking);
  const settle = (!!s.settleHint) || (prevSpeaking && !s.speaking);

  const directive = {
    ...DEFAULT_DIRECTIVE,
    stableKey,
    updatedAt: s.t,

    // Contract fields
    presence: s.presence,
    stage: s.stage,
    dominance: s.dominance,
    velvet: s.velvet,

    pose: "head_shoulders",
    mood: mapMood(s),

    gaze: baseGaze(s),
    gazeWander: baseGazeWander(s),

    headTilt: s.velvet ? 0.12 : s.dominance === "soft" ? 0.1 : s.dominance === "firm" ? 0.04 : 0.07,
    microNodRate:
      s.presence === "listening" ? 0.08 :
      s.presence === "speaking" ? 0.05 :
      s.presence === "thinking" ? 0.02 :
      0.03,

    breathRate: baseBreathRate(s),
    motionIntensity: baseMotionIntensity(s),
    shoulderRise: s.velvet ? 0.12 : s.stage === "engaged" ? 0.17 : 0.15,

    blinkRate: baseBlinkRate(s),
    blinkVariance: s.velvet ? 0.25 : s.presence === "thinking" ? 0.22 : 0.35,

    animSet: mapAnimSet(s, stableKey),

    ...speakingOverlay(s),

    settle,
  };

  return smoothDirective(prevDirective, directive, s);
}

// -------------------------
// UI overlay controller (FAIL-OPEN)
// -------------------------

const LANES = Object.freeze(["general", "music", "roku", "schedule", "radio"]);

function normalizeLane(x) {
  const s = safeStr(x).toLowerCase().trim();
  return LANES.includes(s) ? s : "general";
}

function getHostUI() {
  const ui = (typeof window !== "undefined" && window.NYX_HOST_UI) ? window.NYX_HOST_UI : null;
  if (!ui) return null;
  // Minimum expected nodes
  if (!ui.bubbleText || !ui.bubbleActions) return null;
  return ui;
}

function escapeHtml(str) {
  const s = safeStr(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderBubbleText(ui, htmlText) {
  try {
    ui.bubbleText.innerHTML = safeStr(htmlText);
  } catch (_) {
    // fail-open: ignore
  }
}

function renderActions(ui, actions) {
  // actions: [{key,label,kind,href,external,className}]
  try {
    ui.bubbleActions.innerHTML = "";
    for (const a of (actions || [])) {
      const key = normalizeLane(a && a.key);
      const label = safeStr(a && a.label) || key;
      const kind = safeStr(a && a.kind) || "chip";
      const className = safeStr(a && a.className);

      if (kind === "link") {
        const href = safeStr(a && a.href);
        const external = !!(a && a.external);
        const el = document.createElement("a");
        el.href = href || "#";
        el.textContent = label;
        el.setAttribute("data-chip", key);
        el.style.marginRight = "10px";
        if (external) {
          el.target = "_blank";
          el.rel = "noopener noreferrer";
        }
        ui.bubbleActions.appendChild(el);
      } else {
        const el = document.createElement("div");
        // use action-pill styling if present, otherwise harmless div
        el.className = `action-pill${key === "general" ? " general" : ""}${className ? " " + className : ""}`;
        el.setAttribute("data-chip", key);
        el.textContent = label;
        ui.bubbleActions.appendChild(el);
      }
    }
  } catch (_) {
    // fail-open
  }
}

function setChipRailActive(ui, lane) {
  try {
    const rail = ui.chips;
    if (!rail) return;
    const chips = rail.querySelectorAll(".chip");
    chips.forEach(n => n.classList.remove("is-active"));
    const active = rail.querySelector(`.chip[data-chip="${lane}"]`);
    if (active) active.classList.add("is-active");
  } catch (_) {}
}

// Marion-informed greeting builder (NO RAW USER TEXT STORED)
function deriveGreeting(cog, lane) {
  // cog is expected to be a structured object (from Marion) with safe fields.
  // We only use coarse signals and never store raw text.
  const c = cog && typeof cog === "object" ? cog : {};
  const stage = safeStr(c.stage || c.mode || "").toLowerCase();     // e.g. "cold/warm/engaged"
  const affect = safeStr(c.affect || c.tone || "").toLowerCase();   // e.g. "anxious/curious/neutral"
  const intent = safeStr(c.intent || "").toLowerCase();             // e.g. "browse/ask/plan"
  const seed = safeStr(c.stableKey || c.sessionKey || lane || "general");

  // Softer templates
  const base = [
    "Hi… I’m Nyx. How are you today?",
    "Hey you. How’s your day treating you?",
    "I’m here with you. What do you feel like doing right now?",
  ];

  const warm = [
    "Welcome back. What are you in the mood for?",
    "Good to see you again. Want something familiar—or something new?",
    "Tell me where your head’s at, and I’ll guide the rest.",
  ];

  const engaged = [
    "Alright… I’m locked in with you. Where do we go next?",
    "We can keep momentum. Pick a lane and I’ll take you there.",
    "Let’s make this easy. Choose what you want—I'll handle the rest.",
  ];

  const soothing = [
    "It’s okay. Breathe with me for a second. Then we’ll pick one small step.",
    "No pressure. I can keep it simple—just choose what feels light.",
    "I’ve got you. We can go gently.",
  ];

  let pool = base;
  if (stage === "warm") pool = warm;
  if (stage === "engaged") pool = engaged;

  // If Marion flags anxiety/overwhelm, soften further
  if (affect.includes("anx") || affect.includes("stress") || affect.includes("overwhelm")) {
    pool = soothing;
  }

  // Slightly tune by lane
  if (lane === "music") {
    pool = pool.map(s => s.replace("Pick a lane", "Want music first").replace("Choose what you want", "Choose a vibe"));
  } else if (lane === "roku") {
    pool = pool.map(s => s.replace("Pick a lane", "Want Roku").replace("Choose what you want", "Pick what to watch"));
  } else if (lane === "schedule") {
    pool = pool.map(s => s.replace("Pick a lane", "Want schedule").replace("Choose what you want", "Let’s plan it"));
  } else if (lane === "radio") {
    pool = pool.map(s => s.replace("Pick a lane", "Want radio").replace("Choose what you want", "Let’s tune in"));
  }

  // If intent suggests planning, nudge toward schedule subtly
  if (intent.includes("plan") && lane === "general") {
    pool = pool.concat([
      "Want me to help you plan what’s next? Schedule is one tap away.",
      "If you’re organizing your day, I can help—start with Schedule.",
    ]);
  }

  return stablePick(seed, pool) || base[0];
}

function buildGeneralActions(state) {
  // General acts like "More": it reveals what’s available (and can include deep links later)
  // Keep it minimal: the five essential lanes.
  const actions = [
    { key: "general", label: "General", kind: "chip", className: "general" },
    { key: "music", label: "Music", kind: "chip" },
    { key: "roku", label: "Roku", kind: "chip" },
    // schedule can be treated as link if url exists
    state && state.urls && state.urls.schedule
      ? { key: "schedule", label: "Schedule ↗", kind: "link", href: state.urls.schedule, external: true }
      : { key: "schedule", label: "Schedule", kind: "chip", className: "schedule" },
    state && state.urls && state.urls.radio
      ? { key: "radio", label: "Radio ↗", kind: "link", href: state.urls.radio, external: true }
      : { key: "radio", label: "Radio", kind: "chip" },
  ];

  return actions;
}

function buildLaneBlurb(lane, urls) {
  // short and calm; keep it non-cumbersome
  if (lane === "music") return "Music is ready. Want a year, a mood, or a quick surprise?";
  if (lane === "roku") return "Roku lane is open. Want the channel, a show, or what’s trending?";
  if (lane === "schedule") {
    const u = urls && urls.schedule ? ` <a href="${escapeHtml(urls.schedule)}" target="_blank" rel="noopener noreferrer">Open schedule</a>.` : "";
    return `Schedule mode.${u}`;
  }
  if (lane === "radio") {
    const u = urls && urls.radio ? ` <a href="${escapeHtml(urls.radio)}" target="_blank" rel="noopener noreferrer">Open radio</a>.` : "";
    return `Radio mode.${u}`;
  }
  return "Here’s what we can explore. Choose a lane and I’ll guide you.";
}

function emit(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  } catch (_) {}
}

const UI_STATE = {
  lane: "general",
  marionCog: null,     // structured object only
  urls: {
    schedule: "",
    radio: "",
    roku: "",
    music: "",
  },
  lastRenderAt: 0,
  autoGreeted: false,
};

function setUrls(urls) {
  const u = urls && typeof urls === "object" ? urls : {};
  UI_STATE.urls = {
    schedule: safeStr(u.schedule || UI_STATE.urls.schedule || ""),
    radio: safeStr(u.radio || UI_STATE.urls.radio || ""),
    roku: safeStr(u.roku || UI_STATE.urls.roku || ""),
    music: safeStr(u.music || UI_STATE.urls.music || ""),
  };
  renderUI({ reason: "urls" });
}

function setMarionCog(cog) {
  // do not store raw text; accept object only
  UI_STATE.marionCog = (cog && typeof cog === "object") ? cog : null;
  renderUI({ reason: "marion" });
}

function setLane(lane) {
  UI_STATE.lane = normalizeLane(lane);
  renderUI({ reason: "lane" });
  emit("nyx:lane", { lane: UI_STATE.lane });
}

function renderUI(meta) {
  const ui = getHostUI();
  if (!ui) return;

  const t = nowMs();
  // tiny throttle to avoid excessive DOM churn
  if (t - UI_STATE.lastRenderAt < 40) return;
  UI_STATE.lastRenderAt = t;

  const lane = UI_STATE.lane;
  setChipRailActive(ui, lane);

  // Greeting: only auto-greet when we first render (or when Marion arrives and we haven't greeted)
  const greet = deriveGreeting(UI_STATE.marionCog, lane);
  const laneBlurb = buildLaneBlurb(lane, UI_STATE.urls);

  // General = gateway: show options inside bubble always (acts like "More")
  // Other lanes: show minimal “return + lane” actions.
  if (lane === "general") {
    renderBubbleText(ui, escapeHtml(greet) + "<br><span style='opacity:.82'>" + escapeHtml(laneBlurb) + "</span>");
    renderActions(ui, buildGeneralActions(UI_STATE));
  } else {
    const backActions = [
      { key: "general", label: "General", kind: "chip", className: "general" },
      { key: lane, label: lane.charAt(0).toUpperCase() + lane.slice(1), kind: "chip" },
    ];

    // If lane has a url, add a link action too
    const url = UI_STATE.urls && UI_STATE.urls[lane] ? UI_STATE.urls[lane] : "";
    if (url) {
      backActions.push({ key: lane, label: "Open ↗", kind: "link", href: url, external: true });
    }

    renderBubbleText(
      ui,
      escapeHtml(greet) + "<br><span style='opacity:.82'>" + laneBlurb + "</span>"
    );
    renderActions(ui, backActions);
  }

  emit("nyx:ui", {
    lane,
    reason: safeStr(meta && meta.reason) || "render",
  });
}

// Bind to host chip events (from avatar-host.html)
function bindHostEvents() {
  if (typeof window === "undefined") return;
  if (bindHostEvents._bound) return;
  bindHostEvents._bound = true;

  window.addEventListener("nyx:chip", function (ev) {
    const d = ev && ev.detail ? ev.detail : {};
    const lane = normalizeLane(d.chip);
    setLane(lane);
  });

  // Opportunistic first render if host UI already exists
  try {
    renderUI({ reason: "boot" });
  } catch (_) {}
}

// Auto-bind on load
try { bindHostEvents(); } catch (_) {}

// -------------------------
// Expose global
// -------------------------
window.AvatarController = {
  // directive engine (kept)
  computeDirective,
  PRESENCE,
  STAGE,
  DOMINANCE,

  // UI control (new, fail-open)
  bindHostEvents,
  setLane,
  setUrls,
  setMarionCog,

  // state snapshot (safe)
  getUIState: function () {
    return {
      lane: UI_STATE.lane,
      hasMarion: !!UI_STATE.marionCog,
      urls: { ...UI_STATE.urls },
    };
  },
};

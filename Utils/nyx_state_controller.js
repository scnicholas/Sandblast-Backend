// nyx_state_controller.js
// Nyx state controller v1
// Purpose:
// - Manage face state transitions: neutral, warm, engaged, curious
// - Blend motion parameters smoothly rather than snapping
// - Add controlled asymmetry and timing offsets so Nyx feels fluid, not robotic
// - Coordinate with speech lifecycle hooks without breaking the neutral presence layer

const NYX_STATES = {
  neutral: {
    eyeGlow: 1.0,
    eyeDriftX: 2,
    eyeDriftY: 1,
    eyeLock: false,
    blinkMinMs: 3500,
    blinkMaxMs: 5500,
    browLeft: 0,
    browRight: -0.5,
    mouthLeft: 1.5,
    mouthRight: 0,
    mouthOpen: 0,
    cheekGlow: 1.0,
    headTiltDeg: 0,
    headDriftPx: 1,
    hairMotion: 1.0,
    hairTightness: 0.0,
    preSpeechDelayMs: 0,
  },
  warm: {
    eyeGlow: 1.06,
    eyeDriftX: 1.5,
    eyeDriftY: 1,
    eyeLock: false,
    blinkMinMs: 4200,
    blinkMaxMs: 5800,
    browLeft: 0.5,
    browRight: 0,
    mouthLeft: 2,
    mouthRight: 1,
    mouthOpen: 0,
    cheekGlow: 1.04,
    headTiltDeg: 0.8,
    headDriftPx: 1,
    hairMotion: 0.95,
    hairTightness: 0.05,
    preSpeechDelayMs: 0,
  },
  engaged: {
    eyeGlow: 1.1,
    eyeDriftX: 0.75,
    eyeDriftY: 0.5,
    eyeLock: true,
    blinkMinMs: 5200,
    blinkMaxMs: 7000,
    browLeft: 3,
    browRight: 2.5,
    mouthLeft: 1,
    mouthRight: 0,
    mouthOpen: 0,
    cheekGlow: 1.03,
    headTiltDeg: 1.5,
    headDriftPx: 0.6,
    hairMotion: 0.6,
    hairTightness: 0.35,
    preSpeechDelayMs: 0,
  },
  curious: {
    eyeGlow: 1.03,
    eyeDriftX: 0.5,
    eyeDriftY: 0.5,
    eyeLock: false,
    blinkMinMs: 4000,
    blinkMaxMs: 6200,
    browLeft: 4,
    browRight: 1,
    mouthLeft: 0.5,
    mouthRight: 0,
    mouthOpen: 0,
    cheekGlow: 1.01,
    headTiltDeg: 1.1,
    headDriftPx: 0.8,
    hairMotion: 0.8,
    hairTightness: 0.15,
    preSpeechDelayMs: 300,
  },
};

const DEFAULT_OPTIONS = {
  transitionMs: 320,
  frameRate: 60,
  jitterPct: 0.15,
  speechJawDelayMs: 30,
  eyeLeadFrames: 1,
  callbacks: {
    onStateValues: null,   // function(values)
    onStateChange: null,   // function({from, to})
    onBlink: null,         // function()
    onSpeechCue: null,     // function(stage)
  },
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function nowMs() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now());
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function jitter(base, pct) {
  const spread = base * pct;
  return rand(base - spread, base + spread);
}

export class NyxStateController {
  constructor(options = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      callbacks: {
        ...DEFAULT_OPTIONS.callbacks,
        ...(options.callbacks || {}),
      },
    };

    this.currentState = 'neutral';
    this.targetState = 'neutral';
    this.isTransitioning = false;
    this.transitionStartMs = 0;
    this.transitionDurationMs = this.options.transitionMs;
    this.fromValues = { ...NYX_STATES.neutral };
    this.currentValues = { ...NYX_STATES.neutral };
    this.toValues = { ...NYX_STATES.neutral };

    this.isSpeechActive = false;
    this.isEyesLocked = false;
    this.eyeLeadFrameOffset = this.options.eyeLeadFrames;
    this.lastUpdateMs = nowMs();
    this.blinkAtMs = this.#scheduleNextBlink(this.currentValues);
    this.blinkActive = false;
    this.blinkStartMs = 0;
    this.blinkDurationCloseMs = 70;
    this.blinkDurationOpenMs = 90;
    this.blinkHoldMs = 20;

    this.idleSeed = Math.random() * 1000;
    this.speechOpen = 0;
    this.speechJaw = 0;
    this.queuedState = null;

    this._rafId = null;
    this._boundTick = this.tick.bind(this);
  }

  start() {
    if (this._rafId != null || typeof requestAnimationFrame === 'undefined') return;
    this._rafId = requestAnimationFrame(this._boundTick);
  }

  stop() {
    if (this._rafId != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
  }

  safeSetState(nextState, transitionMs = this.options.transitionMs) {
    if (!NYX_STATES[nextState]) return false;
    if (nextState === this.targetState && !this.isTransitioning) return false;

    if (this.isTransitioning) {
      this.queuedState = { state: nextState, transitionMs };
      return true;
    }

    this.#beginTransition(nextState, transitionMs);
    return true;
  }

  setNeutral() { return this.safeSetState('neutral'); }
  setWarm() { return this.safeSetState('warm'); }
  setEngaged() { return this.safeSetState('engaged'); }
  setCurious() { return this.safeSetState('curious'); }

  mapEventToState(eventName) {
    switch (eventName) {
      case 'page_load':
      case 'return_user':
      case 'greeting':
        return 'warm';
      case 'user_input':
      case 'clarification_needed':
      case 'thinking':
        return 'curious';
      case 'response_start':
      case 'guide_user':
      case 'deliver_information':
        return 'engaged';
      case 'response_end':
      case 'user_idle':
      default:
        return 'neutral';
    }
  }

  handleEvent(eventName) {
    const state = this.mapEventToState(eventName);
    return this.safeSetState(state);
  }

  safeStartSpeech() {
    if (this.isSpeechActive) this.safeStopSpeech(false);

    const stateProfile = NYX_STATES[this.currentState] || NYX_STATES.neutral;
    const delay = stateProfile.preSpeechDelayMs || 0;

    this.isSpeechActive = true;
    this.#emitSpeechCue('prestart');

    const run = () => {
      this.#emitSpeechCue('eyes_lock');
      this.isEyesLocked = true;

      setTimeout(() => this.#emitSpeechCue('head_adjust'), 40);
      setTimeout(() => this.#emitSpeechCue('brow_lift'), 80);
      setTimeout(() => this.#emitSpeechCue('speech_begin'), 120);
    };

    if (delay > 0) {
      setTimeout(run, delay);
    } else {
      run();
    }
  }

  safeStopSpeech(returnToNeutral = true) {
    this.isSpeechActive = false;
    this.speechOpen = 0;
    this.speechJaw = 0;
    this.isEyesLocked = false;

    this.#emitSpeechCue('speech_end');
    setTimeout(() => this.#emitSpeechCue('post_close'), 80);
    setTimeout(() => this.#emitSpeechCue('jaw_settle'), 140);
    setTimeout(() => this.#emitSpeechCue('eyes_soften'), 260);

    if (returnToNeutral) {
      setTimeout(() => this.safeSetState('neutral'), 320);
    }
  }

  updateSpeechAmplitude(rms) {
    const normalized = clamp((rms - 0.05) / (0.6 - 0.05), 0, 1);
    const smoothed = lerp(this.speechOpen, normalized, 0.35);
    this.speechOpen = smoothed;

    setTimeout(() => {
      this.speechJaw = lerp(this.speechJaw, smoothed, 0.4);
    }, this.options.speechJawDelayMs);
  }

  tick(timestamp = nowMs()) {
    const dt = Math.max(0, timestamp - this.lastUpdateMs);
    this.lastUpdateMs = timestamp;

    this.#updateTransition(timestamp);
    this.#updateBlink(timestamp);

    const values = this.#composeFrameValues(timestamp, dt);
    this.currentValues = values;

    if (typeof this.options.callbacks.onStateValues === 'function') {
      this.options.callbacks.onStateValues(values);
    }

    if (this._rafId != null || typeof requestAnimationFrame !== 'undefined') {
      this._rafId = requestAnimationFrame(this._boundTick);
    }

    return values;
  }

  #beginTransition(nextState, transitionMs) {
    const from = this.currentState;

    this.fromValues = { ...this.currentValues };
    this.toValues = { ...NYX_STATES[nextState] };
    this.targetState = nextState;
    this.transitionStartMs = nowMs();
    this.transitionDurationMs = transitionMs;
    this.isTransitioning = true;

    if (typeof this.options.callbacks.onStateChange === 'function') {
      this.options.callbacks.onStateChange({ from, to: nextState });
    }
  }

  #updateTransition(timestamp) {
    if (!this.isTransitioning) return;

    const elapsed = timestamp - this.transitionStartMs;
    const t = clamp(elapsed / this.transitionDurationMs, 0, 1);
    const e = easeInOutCubic(t);

    const blended = {};
    for (const key of Object.keys(this.toValues)) {
      const a = this.fromValues[key];
      const b = this.toValues[key];
      blended[key] = typeof a === 'number' && typeof b === 'number' ? lerp(a, b, e) : (t < 1 ? a : b);
    }
    this.currentValues = blended;

    if (t >= 1) {
      this.currentState = this.targetState;
      this.currentValues = { ...this.toValues };
      this.isTransitioning = false;

      if (this.queuedState) {
        const queued = this.queuedState;
        this.queuedState = null;
        this.#beginTransition(queued.state, queued.transitionMs);
      }
    }
  }

  #composeFrameValues(timestamp, dt) {
    const base = { ...this.currentValues };
    const time = timestamp / 1000;

    const driftScaleX = this.isEyesLocked || base.eyeLock ? 0.2 : 1;
    const driftScaleY = this.isEyesLocked || base.eyeLock ? 0.2 : 1;

    const eyePhaseA = time * 0.6 + this.idleSeed;
    const eyePhaseB = time * 0.57 + this.idleSeed + 0.14; // slight offset: breaks symmetry

    const leftEyeDx = Math.sin(eyePhaseA) * base.eyeDriftX * driftScaleX;
    const leftEyeDy = Math.cos(eyePhaseA * 0.8) * base.eyeDriftY * driftScaleY;
    const rightEyeDx = Math.sin(eyePhaseB) * base.eyeDriftX * 0.92 * driftScaleX;
    const rightEyeDy = Math.cos(eyePhaseB * 0.8) * base.eyeDriftY * 0.88 * driftScaleY;

    const headPhase = time * 0.28 + this.idleSeed * 0.2;
    const headY = Math.sin(headPhase) * base.headDriftPx;
    const headX = Math.cos(headPhase * 0.9) * Math.min(1, base.headDriftPx);
    const headTilt = base.headTiltDeg + Math.sin(headPhase * 0.75) * 0.18;

    const hairPhase = time * 0.22 + this.idleSeed * 0.35;
    const hairDrift = Math.sin(hairPhase) * 5 * base.hairMotion;
    const hairTail = Math.cos(hairPhase * 1.2) * 7 * base.hairMotion;

    const glowPulse = 1 + (Math.sin(time * 0.95 + this.idleSeed) * 0.02);
    const eyeGlow = base.eyeGlow * glowPulse * (this.isSpeechActive ? 1.08 : 1);
    const cheekGlow = base.cheekGlow * (1 + Math.sin(time * 0.65 + this.idleSeed + 0.4) * 0.01);

    const blink = this.#getBlinkAmount(timestamp);

    const mouthOpenPx = this.isSpeechActive ? this.speechOpen * 12 : base.mouthOpen;
    const mouthLeftLiftPx = base.mouthLeft + (this.isSpeechActive ? this.speechOpen * 2.0 : Math.sin(time * 0.35) * 0.5);
    const mouthRightLiftPx = base.mouthRight + (this.isSpeechActive ? this.speechOpen * 1.2 : Math.cos(time * 0.31) * 0.35);
    const jawDropPx = this.isSpeechActive ? this.speechJaw * 5 : 0;

    const browLeftPx = base.browLeft + (this.isSpeechActive ? Math.max(0, this.speechOpen - 0.55) * 1.5 : Math.sin(time * 0.23) * 0.2);
    const browRightPx = base.browRight + (this.isSpeechActive ? Math.max(0, this.speechOpen - 0.62) * 1.1 : Math.cos(time * 0.21) * 0.15);

    return {
      state: this.currentState,
      targetState: this.targetState,
      isSpeechActive: this.isSpeechActive,
      isEyesLocked: this.isEyesLocked || base.eyeLock,

      eyes: {
        left: { dx: leftEyeDx, dy: leftEyeDy, blink },
        right: { dx: rightEyeDx, dy: rightEyeDy, blink: blink * 0.98 },
        glow: eyeGlow,
      },

      brows: {
        leftY: browLeftPx,
        rightY: browRightPx,
      },

      mouth: {
        openY: mouthOpenPx,
        leftCornerY: mouthLeftLiftPx,
        rightCornerY: mouthRightLiftPx,
      },

      jaw: {
        dropY: jawDropPx,
      },

      cheeks: {
        glow: cheekGlow,
      },

      head: {
        x: headX,
        y: headY,
        tiltDeg: headTilt,
      },

      hair: {
        massDx: hairDrift,
        tailDx: hairTail,
        tightness: base.hairTightness,
      },
    };
  }

  #scheduleNextBlink(values) {
    return nowMs() + rand(values.blinkMinMs, values.blinkMaxMs);
  }

  #updateBlink(timestamp) {
    if (!this.blinkActive && timestamp >= this.blinkAtMs && !this.isSpeechActive) {
      this.blinkActive = true;
      this.blinkStartMs = timestamp;
      this.blinkDurationCloseMs = jitter(70, this.options.jitterPct);
      this.blinkDurationOpenMs = jitter(90, this.options.jitterPct);
      this.blinkHoldMs = jitter(20, this.options.jitterPct);

      if (typeof this.options.callbacks.onBlink === 'function') {
        this.options.callbacks.onBlink();
      }
    }

    if (!this.blinkActive) return;

    const elapsed = timestamp - this.blinkStartMs;
    const closeEnd = this.blinkDurationCloseMs;
    const holdEnd = closeEnd + this.blinkHoldMs;
    const openEnd = holdEnd + this.blinkDurationOpenMs;

    if (elapsed >= openEnd) {
      this.blinkActive = false;
      this.blinkAtMs = this.#scheduleNextBlink(this.currentValues);
    }
  }

  #getBlinkAmount(timestamp) {
    if (!this.blinkActive) return 0;

    const elapsed = timestamp - this.blinkStartMs;
    const closeEnd = this.blinkDurationCloseMs;
    const holdEnd = closeEnd + this.blinkHoldMs;
    const openEnd = holdEnd + this.blinkDurationOpenMs;

    if (elapsed <= closeEnd) {
      return easeInOutCubic(elapsed / closeEnd);
    }
    if (elapsed <= holdEnd) {
      return 1;
    }
    if (elapsed <= openEnd) {
      const t = (elapsed - holdEnd) / this.blinkDurationOpenMs;
      return 1 - easeInOutCubic(t);
    }
    return 0;
  }

  #emitSpeechCue(stage) {
    if (typeof this.options.callbacks.onSpeechCue === 'function') {
      this.options.callbacks.onSpeechCue(stage);
    }
  }
}

export default NyxStateController;

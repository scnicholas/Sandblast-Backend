// nyx_state_controller.js
// Pipeline normalized build: adds CommonJS compatibility without changing browser behavior
// Nyx state controller v2.0 — persistent guide-shell lifecycle
// Purpose:
// - Manage face state transitions: neutral, warm, engaged, curious
// - Blend motion parameters smoothly rather than snapping
// - Add controlled asymmetry and timing offsets so Nyx feels fluid, not robotic
// - Coordinate guide, panel, microphone and speech lifecycles without controlling audio

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
  receptive: {
    eyeGlow: 1.045,
    eyeDriftX: 0.6,
    eyeDriftY: 0.45,
    eyeLock: false,
    blinkMinMs: 4300,
    blinkMaxMs: 6400,
    browLeft: 1.8,
    browRight: 1.1,
    mouthLeft: 1.1,
    mouthRight: 0.6,
    mouthOpen: 0,
    cheekGlow: 1.02,
    headTiltDeg: 1.3,
    headDriftPx: 0.75,
    hairMotion: 0.78,
    hairTightness: 0.18,
    preSpeechDelayMs: 180,
  },
  supportive: {
    eyeGlow: 1.055,
    eyeDriftX: 0.35,
    eyeDriftY: 0.3,
    eyeLock: true,
    blinkMinMs: 4700,
    blinkMaxMs: 6800,
    browLeft: 1.2,
    browRight: 0.9,
    mouthLeft: 1.9,
    mouthRight: 1.4,
    mouthOpen: 0,
    cheekGlow: 1.035,
    headTiltDeg: 1.6,
    headDriftPx: 0.55,
    hairMotion: 0.55,
    hairTightness: 0.28,
    preSpeechDelayMs: 120,
  },
};


const NYX_GUIDE_STATES = Object.freeze([
  'available', 'listening', 'thinking', 'speaking',
  'guiding', 'quiet', 'recovery', 'minimized'
]);

const GUIDE_TO_FACE_STATE = Object.freeze({
  available: 'warm',
  listening: 'receptive',
  thinking: 'curious',
  speaking: 'engaged',
  guiding: 'engaged',
  quiet: 'neutral',
  recovery: 'supportive',
  minimized: 'neutral',
});

function normalizeGuideState(value) {
  const state = String(value == null ? '' : value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '');
  return NYX_GUIDE_STATES.includes(state) ? state : 'available';
}

function boolish(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const text = String(value == null ? '' : value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(text)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(text)) return false;
  return fallback;
}

function systemReducedMotion() {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_e) {
    return false;
  }
}

function readStoredGuideState(storage, key) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch (_e) {
    return null;
  }
}

function writeStoredGuideState(storage, key, value) {
  try {
    if (storage && typeof storage.setItem === 'function') storage.setItem(key, JSON.stringify(value));
  } catch (_e) {}
}

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
    onGuideStateChange: null, // function(snapshot)
  },
  breathMotionPct: 0.08,
  responseLingerMs: 260,
  autoBindVoiceEvents: true,
  voiceEventTarget: null,
  audioElement: null,
  guideElement: null,
  guideStatusElement: null,
  autoBindGuideElement: true,
  persistGuideUiState: true,
  guideStorageKey: 'sb_nyx_guide_shell_state',
  guideStorage: null,
  reducedMotion: null,
  voiceEnabled: true,
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

class NyxStateController {
  constructor(options = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      callbacks: {
        ...DEFAULT_OPTIONS.callbacks,
        ...(options.callbacks || {}),
      },
    };

    this.options.reducedMotion = this.options.reducedMotion == null
      ? systemReducedMotion()
      : boolish(this.options.reducedMotion, false);
    this.options.voiceEnabled = boolish(this.options.voiceEnabled, true);

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
    this._speechToken = 0;

    this._rafId = null;
    this._boundTick = this.tick.bind(this);
    this._voiceEventTarget = null;
    this._voiceEventHandlers = null;
    this._audioElement = null;
    this._audioHandlers = null;
    this._speechTimers = new Set();
    this._syntheticSpeechPhase = 0;
    this.guideState = 'available';
    this.panelOpen = false;
    this.voiceEnabled = this.options.voiceEnabled;
    this.reducedMotion = !!this.options.reducedMotion;
    this._guideElement = null;
    this._guideStatusElement = null;
    this._guideStorage = this.options.guideStorage || (
      typeof window !== 'undefined' && this.options.persistGuideUiState ? window.sessionStorage : null
    );

    const storedGuide = readStoredGuideState(this._guideStorage, this.options.guideStorageKey);
    if (storedGuide) {
      this.guideState = normalizeGuideState(storedGuide.guideState);
      this.panelOpen = storedGuide.panelOpen === true;
      this.voiceEnabled = storedGuide.voiceEnabled !== false;
    }

    if (this.options.autoBindGuideElement && this.options.guideElement) {
      this.bindGuideElement(this.options.guideElement, this.options.guideStatusElement);
    }
    if (this.options.audioElement) this.attachAudioElement(this.options.audioElement);
    if (this.options.autoBindVoiceEvents && typeof window !== 'undefined') {
      this.bindVoiceEvents(this.options.voiceEventTarget || window);
    }
  }

  start() {
    if (this.options.autoBindVoiceEvents && !this._voiceEventTarget && typeof window !== 'undefined') {
      this.bindVoiceEvents(this.options.voiceEventTarget || window);
    }
    if (this._rafId != null || typeof requestAnimationFrame === 'undefined') return;
    this._rafId = requestAnimationFrame(this._boundTick);
  }

  stop() {
    if (this._rafId != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._rafId);
    }
    this._rafId = null;
    this.#clearSpeechTimers();
  }

  destroy() {
    this.safeStopSpeech(false);
    this.#clearSpeechTimers();
    this.stop();
    this.detachAudioElement();
    this.unbindVoiceEvents();
    this.unbindGuideElement();
  }

  bindVoiceEvents(target) {
    if (!target || typeof target.addEventListener !== 'function') return false;
    if (this._voiceEventTarget === target && this._voiceEventHandlers) return true;
    this.unbindVoiceEvents();
    const detail = (event) => event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    const handlers = {
      prestart: () => { this.setGuideState('thinking'); this.handleEvent('response_start'); this.safeStartSpeech(); },
      start: () => { this.setGuideState('speaking'); this.handleEvent('deliver_information'); this.safeStartSpeech(); },
      amplitude: (event) => this.updateSpeechAmplitude(Number(detail(event).rms ?? detail(event).amplitude ?? detail(event).value ?? 0)),
      end: () => { this.safeStopSpeech(true); this.setGuideState(this.panelOpen ? 'available' : 'minimized'); },
      error: () => { this.safeStopSpeech(true); this.setGuideState('recovery'); this.handleEvent('response_end'); },
      state: (event) => {
        const value = detail(event);
        const rawState = String(value.guideState || value.state || value.stateHint || '').trim();
        const guideState = rawState.toLowerCase().replace(/[^a-z0-9_-]+/g, '');
        if (NYX_GUIDE_STATES.includes(guideState)) this.setGuideState(guideState);
        else if (NYX_STATES[rawState]) this.safeSetState(rawState);
      },
      guideOpen: () => this.setPanelOpen(true),
      guideClose: () => this.setPanelOpen(false),
      guideListening: () => this.setGuideState('listening'),
      guideThinking: () => this.setGuideState('thinking'),
      guideSpeaking: () => this.setGuideState('speaking'),
      guideGuiding: () => this.setGuideState('guiding'),
      guideQuiet: () => this.setGuideState('quiet'),
      guideRecovery: () => this.setGuideState('recovery')
    };
    target.addEventListener('nyx:voice:prestart', handlers.prestart);
    target.addEventListener('nyx:voice:start', handlers.start);
    target.addEventListener('nyx:voice:amplitude', handlers.amplitude);
    target.addEventListener('nyx:voice:end', handlers.end);
    target.addEventListener('nyx:voice:error', handlers.error);
    target.addEventListener('nyx:state', handlers.state);
    target.addEventListener('nyx:guide:state', handlers.state);
    target.addEventListener('nyx:guide:open', handlers.guideOpen);
    target.addEventListener('nyx:guide:close', handlers.guideClose);
    target.addEventListener('nyx:guide:listening', handlers.guideListening);
    target.addEventListener('nyx:guide:thinking', handlers.guideThinking);
    target.addEventListener('nyx:guide:speaking', handlers.guideSpeaking);
    target.addEventListener('nyx:guide:guiding', handlers.guideGuiding);
    target.addEventListener('nyx:guide:quiet', handlers.guideQuiet);
    target.addEventListener('nyx:guide:recovery', handlers.guideRecovery);
    this._voiceEventTarget = target;
    this._voiceEventHandlers = handlers;
    return true;
  }

  unbindVoiceEvents() {
    const target = this._voiceEventTarget;
    const handlers = this._voiceEventHandlers;
    if (target && handlers && typeof target.removeEventListener === 'function') {
      target.removeEventListener('nyx:voice:prestart', handlers.prestart);
      target.removeEventListener('nyx:voice:start', handlers.start);
      target.removeEventListener('nyx:voice:amplitude', handlers.amplitude);
      target.removeEventListener('nyx:voice:end', handlers.end);
      target.removeEventListener('nyx:voice:error', handlers.error);
      target.removeEventListener('nyx:state', handlers.state);
      target.removeEventListener('nyx:guide:state', handlers.state);
      target.removeEventListener('nyx:guide:open', handlers.guideOpen);
      target.removeEventListener('nyx:guide:close', handlers.guideClose);
      target.removeEventListener('nyx:guide:listening', handlers.guideListening);
      target.removeEventListener('nyx:guide:thinking', handlers.guideThinking);
      target.removeEventListener('nyx:guide:speaking', handlers.guideSpeaking);
      target.removeEventListener('nyx:guide:guiding', handlers.guideGuiding);
      target.removeEventListener('nyx:guide:quiet', handlers.guideQuiet);
      target.removeEventListener('nyx:guide:recovery', handlers.guideRecovery);
    }
    this._voiceEventTarget = null;
    this._voiceEventHandlers = null;
  }

  bindGuideElement(guideElement, statusElement) {
    let element = guideElement;
    let status = statusElement;
    if (typeof document !== 'undefined') {
      if (typeof element === 'string') element = document.querySelector(element);
      if (typeof status === 'string') status = document.querySelector(status);
    }
    if (!element || typeof element.setAttribute !== 'function') return false;
    this._guideElement = element;
    this._guideStatusElement = status || null;
    this.#applyGuideStateToDom();
    return true;
  }

  unbindGuideElement() {
    this._guideElement = null;
    this._guideStatusElement = null;
  }

  setPanelOpen(open) {
    this.panelOpen = open === true;
    if (!this.isSpeechActive) this.guideState = this.panelOpen ? 'available' : 'minimized';
    this.#persistGuideUiState();
    this.#applyGuideStateToDom();
    this.#dispatchGuideState();
    return this.panelOpen;
  }

  setVoiceEnabled(enabled) {
    this.voiceEnabled = enabled !== false;
    if (!this.voiceEnabled && this.isSpeechActive) this.safeStopSpeech(true);
    if (!this.voiceEnabled) this.guideState = 'quiet';
    else if (this.guideState === 'quiet') this.guideState = this.panelOpen ? 'available' : 'minimized';
    this.#persistGuideUiState();
    this.#applyGuideStateToDom();
    this.#dispatchGuideState();
    return this.voiceEnabled;
  }

  setGuideState(nextState, options = {}) {
    const state = normalizeGuideState(nextState);
    if (state === 'speaking' && !this.voiceEnabled) return this.setGuideState('quiet', options);
    const changed = state !== this.guideState;
    this.guideState = state;
    const faceState = GUIDE_TO_FACE_STATE[state] || 'neutral';
    this.safeSetState(faceState, Number(options.transitionMs) || this.options.transitionMs);
    this.#persistGuideUiState();
    this.#applyGuideStateToDom();
    if (changed || options.force === true) this.#dispatchGuideState();
    return changed;
  }

  getGuideSnapshot() {
    return {
      version: NYX_STATE_CONTROLLER_VERSION,
      guideState: this.guideState,
      faceState: this.currentState,
      targetFaceState: this.targetState,
      panelOpen: this.panelOpen,
      voiceEnabled: this.voiceEnabled,
      reducedMotion: this.reducedMotion,
      speaking: this.isSpeechActive
    };
  }

  attachAudioElement(audioElement) {
    if (!audioElement || typeof audioElement.addEventListener !== 'function') return false;
    if (this._audioElement === audioElement) return true;
    this.detachAudioElement();
    const onStart = () => { this.handleEvent('deliver_information'); this.safeStartSpeech(); };
    const onEnd = () => this.safeStopSpeech(true);
    const onError = () => { this.safeStopSpeech(true); this.handleEvent('response_end'); };
    const onTimeUpdate = () => {
      if (!this.isSpeechActive || audioElement.paused || audioElement.ended) return;
      const t = Number(audioElement.currentTime || 0);
      const phase = (Math.sin(t * 17.3) + Math.sin(t * 8.7 + 0.8) + 2) / 4;
      this.updateSpeechAmplitude(0.08 + phase * 0.34);
    };
    audioElement.addEventListener('play', onStart);
    audioElement.addEventListener('playing', onStart);
    audioElement.addEventListener('pause', onEnd);
    audioElement.addEventListener('ended', onEnd);
    audioElement.addEventListener('error', onError);
    audioElement.addEventListener('timeupdate', onTimeUpdate);
    this._audioElement = audioElement;
    this._audioHandlers = { onStart, onEnd, onError, onTimeUpdate };
    return true;
  }

  detachAudioElement() {
    const el = this._audioElement;
    const h = this._audioHandlers;
    if (el && h && typeof el.removeEventListener === 'function') {
      el.removeEventListener('play', h.onStart);
      el.removeEventListener('playing', h.onStart);
      el.removeEventListener('pause', h.onEnd);
      el.removeEventListener('ended', h.onEnd);
      el.removeEventListener('error', h.onError);
      el.removeEventListener('timeupdate', h.onTimeUpdate);
    }
    this._audioElement = null;
    this._audioHandlers = null;
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
  setReceptive() { return this.safeSetState('receptive'); }
  setSupportive() { return this.safeSetState('supportive'); }

  mapEventToState(eventName) {
    switch (eventName) {
      case 'page_load':
      case 'return_user':
      case 'greeting':
        return 'warm';
      case 'user_input':
      case 'clarification_needed':
      case 'thinking':
      case 'guide_thinking':
        return 'curious';
      case 'listening':
      case 'guide_listening':
      case 'user_emotion':
      case 'reassure':
        return 'receptive';
      case 'distress':
      case 'comfort':
      case 'support':
        return 'supportive';
      case 'response_start':
      case 'voice_prestart':
      case 'voice_start':
      case 'playback_start':
      case 'guide_user':
      case 'guide_open':
      case 'deliver_information':
        return 'engaged';
      case 'response_end':
      case 'voice_end':
      case 'playback_end':
      case 'voice_error':
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
    if (!this.voiceEnabled) {
      this.setGuideState('quiet');
      return false;
    }
    if (this.isSpeechActive) return false;
    this.guideState = 'speaking';
    this.#applyGuideStateToDom();
    this.#clearSpeechTimers();

    const stateProfile = NYX_STATES[this.currentState] || NYX_STATES.neutral;
    const delay = stateProfile.preSpeechDelayMs || 0;
    const speechToken = ++this._speechToken;

    this.isSpeechActive = true;
    this.#emitSpeechCue('prestart');

    const run = () => {
      if (speechToken !== this._speechToken || !this.isSpeechActive) return;
      this.#emitSpeechCue('eyes_lock');
      this.isEyesLocked = true;

      this.#scheduleSpeechCue('head_adjust', 40, speechToken);
      this.#scheduleSpeechCue('brow_lift', 80, speechToken);
      this.#scheduleSpeechCue('speech_begin', 120, speechToken);
    };

    if (delay > 0) {
      this.#scheduleSpeechCallback(run, delay, speechToken);
    } else {
      run();
    }
    return true;
  }

  safeStopSpeech(returnToNeutral = true) {
    this._speechToken++;
    this.#clearSpeechTimers();
    this.isSpeechActive = false;
    this.speechOpen = 0;
    this.speechJaw = 0;
    this.isEyesLocked = false;
    this.guideState = this.panelOpen ? 'available' : 'minimized';
    this.#persistGuideUiState();
    this.#applyGuideStateToDom();

    this.#emitSpeechCue('speech_end');
    const stopToken = this._speechToken;
    this.#scheduleSpeechCue('post_close', 80, stopToken, false);
    this.#scheduleSpeechCue('jaw_settle', 140, stopToken, false);
    this.#scheduleSpeechCue('eyes_soften', 260, stopToken, false);

    if (returnToNeutral) {
      this.#scheduleSpeechCallback(() => this.safeSetState('neutral'), this.options.responseLingerMs, stopToken, false);
    }
    return true;
  }

  updateSpeechAmplitude(rms) {
    const value = Number.isFinite(Number(rms)) ? Number(rms) : 0;
    const normalized = clamp((value - 0.05) / (0.6 - 0.05), 0, 1);
    const smoothed = lerp(this.speechOpen, normalized, 0.35);
    this.speechOpen = smoothed;
    this.speechJaw = lerp(this.speechJaw, smoothed, 0.4);
    return smoothed;
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

    if (this._rafId != null && typeof requestAnimationFrame !== 'undefined') {
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
    this.transitionDurationMs = Math.max(1, Number(transitionMs) || this.options.transitionMs || 1);
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
    const motionScale = this.reducedMotion ? 0 : 1;

    const driftScaleX = (this.isEyesLocked || base.eyeLock ? 0.2 : 1) * motionScale;
    const driftScaleY = (this.isEyesLocked || base.eyeLock ? 0.2 : 1) * motionScale;

    const eyePhaseA = time * 0.6 + this.idleSeed;
    const eyePhaseB = time * 0.57 + this.idleSeed + 0.14; // slight offset: breaks symmetry

    const leftEyeDx = Math.sin(eyePhaseA) * base.eyeDriftX * driftScaleX;
    const leftEyeDy = Math.cos(eyePhaseA * 0.8) * base.eyeDriftY * driftScaleY;
    const rightEyeDx = Math.sin(eyePhaseB) * base.eyeDriftX * 0.92 * driftScaleX;
    const rightEyeDy = Math.cos(eyePhaseB * 0.8) * base.eyeDriftY * 0.88 * driftScaleY;

    const headPhase = time * 0.28 + this.idleSeed * 0.2;
    const breath = Math.sin(time * 0.18 + this.idleSeed * 0.1) * this.options.breathMotionPct;
    const headY = (Math.sin(headPhase) * base.headDriftPx + breath) * motionScale;
    const headX = Math.cos(headPhase * 0.9) * Math.min(1, base.headDriftPx) * motionScale;
    const headTilt = base.headTiltDeg + Math.sin(headPhase * 0.75) * 0.18 * motionScale;

    const hairPhase = time * 0.22 + this.idleSeed * 0.35;
    const hairDrift = Math.sin(hairPhase) * 5 * base.hairMotion * motionScale;
    const hairTail = Math.cos(hairPhase * 1.2) * 7 * base.hairMotion * motionScale;

    const glowPulse = 1 + (Math.sin(time * 0.95 + this.idleSeed) * 0.02);
    const eyeGlow = base.eyeGlow * glowPulse * (this.isSpeechActive ? 1.08 : 1);
    const cheekGlow = base.cheekGlow * (1 + Math.sin(time * 0.65 + this.idleSeed + 0.4) * 0.01) * (1 + breath * 0.2);

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
      guideState: this.guideState,
      panelOpen: this.panelOpen,
      voiceEnabled: this.voiceEnabled,
      reducedMotion: this.reducedMotion,
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

  #persistGuideUiState() {
    if (!this.options.persistGuideUiState) return;
    writeStoredGuideState(this._guideStorage, this.options.guideStorageKey, {
      guideState: this.guideState,
      panelOpen: this.panelOpen,
      voiceEnabled: this.voiceEnabled
    });
  }

  #applyGuideStateToDom() {
    const el = this._guideElement;
    if (!el || typeof el.setAttribute !== 'function') return;
    try {
      el.setAttribute('data-nyx-guide-state', this.guideState);
      el.setAttribute('data-nyx-face-state', this.currentState);
      el.setAttribute('aria-expanded', this.panelOpen ? 'true' : 'false');
      el.setAttribute('aria-busy', ['listening', 'thinking', 'speaking'].includes(this.guideState) ? 'true' : 'false');
      if (this._guideStatusElement) {
        this._guideStatusElement.textContent = this.guideState.charAt(0).toUpperCase() + this.guideState.slice(1);
      }
    } catch (_e) {}
  }

  #dispatchGuideState() {
    const snapshot = this.getGuideSnapshot();
    if (typeof this.options.callbacks.onGuideStateChange === 'function') {
      try { this.options.callbacks.onGuideStateChange(snapshot); } catch (_e) {}
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      try { window.dispatchEvent(new CustomEvent('nyx:guide:statechange', { detail: snapshot })); } catch (_e) {}
    }
  }

  #scheduleSpeechCallback(callback, delayMs, token, requireActive = true) {
    const timer = setTimeout(() => {
      this._speechTimers.delete(timer);
      if (token !== this._speechToken) return;
      if (requireActive && !this.isSpeechActive) return;
      callback();
    }, Math.max(0, Number(delayMs) || 0));
    this._speechTimers.add(timer);
    return timer;
  }

  #scheduleSpeechCue(stage, delayMs, token, requireActive = true) {
    return this.#scheduleSpeechCallback(() => this.#emitSpeechCue(stage), delayMs, token, requireActive);
  }

  #clearSpeechTimers() {
    for (const timer of this._speechTimers) clearTimeout(timer);
    this._speechTimers.clear();
  }

  #emitSpeechCue(stage) {
    if (typeof this.options.callbacks.onSpeechCue === 'function') {
      this.options.callbacks.onSpeechCue(stage);
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      try { window.dispatchEvent(new CustomEvent('nyx:speech-cue', { detail: { stage, state: this.currentState } })); } catch (_e) {}
    }
  }
}



if (typeof window !== "undefined") {
  window.NyxStateController = NyxStateController;
  window.NYX_STATES = NYX_STATES;
  window.NYX_GUIDE_STATES = NYX_GUIDE_STATES;
}

const NYX_STATE_CONTROLLER_VERSION = "nyx_state_controller v2.0.0 PERSISTENT-GUIDE-SHELL-LIFECYCLE";

if (typeof module !== "undefined" && module.exports) {
  module.exports = NyxStateController;
  module.exports.default = NyxStateController;
  module.exports.NYX_STATES = NYX_STATES;
  module.exports.NYX_GUIDE_STATES = NYX_GUIDE_STATES;
  module.exports.normalizeGuideState = normalizeGuideState;
  module.exports.NYX_STATE_CONTROLLER_VERSION = NYX_STATE_CONTROLLER_VERSION;
}

"use strict";

const VERSION = "progressionShape v1.1.0 RESPONSE-EXPANSION-HARDLOCK";
const PROGRESSION_SHAPING_REFINEMENT_VERSION = "nyx.marion.progressionShapingRefinement/1.1";

const PROGRESSION_SIGNALS = Object.freeze({
  NEXT_STEPS: "next_steps",
  CLARIFICATION: "clarification",
  EXECUTION: "execution",
  STRATEGY: "strategy",
  RECOVERY: "recovery",
  TESTING: "testing",
  SUMMARY: "summary",
  PASS: "pass",
  FAIL: "fail",
  CONTINUE: "continue",
  UNKNOWN: "unknown"
});

const PROGRESSION_PHASES = Object.freeze({
  phase1: Object.freeze({
    id: "PHASE_1_SIGNAL_DETECTION",
    key: "phase1",
    label: "Phase 1: Progression signal detection",
    objective: "Detect next-step, pass/fail, execution, testing, recovery, clarification, and summary signals without reopening a broad menu."
  }),
  phase2: Object.freeze({
    id: "PHASE_2_CONTINUITY_MEMORY",
    key: "phase2",
    label: "Phase 2: Progression memory and continuity",
    objective: "Carry activePhase, currentStep, lastUserIntent, lastSystemAction, pendingAction, and pass/fail state across follow-up turns."
  }),
  phase3: Object.freeze({
    id: "PHASE_3_RESPONSE_SHAPING",
    key: "phase3",
    label: "Phase 3: Response shaping rules",
    objective: "Prevent thin public replies by shaping next steps, pass, fail, continue, and update prompts into concrete build-mode actions."
  }),
  phase4: Object.freeze({
    id: "PHASE_4_REGRESSION_TELEMETRY",
    key: "phase4",
    label: "Phase 4: Regression tests and telemetry",
    objective: "Validate the progression path and carry clean telemetry without leaking diagnostics to the public reply."
  })
});

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function lower(value) { return safeStr(value).toLowerCase(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback; }
function firstText() { for (let i = 0; i < arguments.length; i += 1) { const v = safeStr(arguments[i]); if (v) return v; } return ""; }

function extractProgressionCarry(context = {}) {
  const c = safeObj(context);
  const memory = safeObj(c.memory || c.previousMemory || c.state || c.turnMemory || c.conversationState);
  const bridge = safeObj(c.stateBridge || memory.stateBridge);
  return safeObj(c.progressionRefinement || c.progressionMemory || bridge.progressionRefinement || memory.progressionRefinement || memory.progressionMemory || c.phaseAnchor || memory.phaseAnchor);
}

function detectProgressionSignal(text = "", context = {}) {
  const t = lower(text);
  const c = safeObj(context);
  const carry = extractProgressionCarry(c);
  if (!t) return firstText(carry.lastUserIntent, carry.signal, carry.lastSignal, PROGRESSION_SIGNALS.UNKNOWN);

  if (/^\s*(pass(?:ed)?|all passed|green|success|works|complete|locked)\s*[.!?]*\s*$/i.test(t) || /\b(all passed|tests? passed|phase passed|green|successfully passed)\b/i.test(t)) return PROGRESSION_SIGNALS.PASS;
  if (/^\s*(fail(?:ed)?|red|error|broke|not working|still failing|didn'?t pass|issue)\s*[.!?]*\s*$/i.test(t) || /\b(failed|still failing|didn'?t pass|not working|broke|error)\b/i.test(t)) return PROGRESSION_SIGNALS.FAIL;
  if (/^\s*(continue|carry on|keep going|proceed)\s*[.!?]*\s*$/i.test(t)) return PROGRESSION_SIGNALS.CONTINUE;
  if (/\b(next steps?|what now|what'?s next|next phase|after that|move on)\b/i.test(t)) return PROGRESSION_SIGNALS.NEXT_STEPS;
  if (/\b(update|patch|fix|make the change|apply|resend|zip|downloadable|replace)\b/i.test(t)) return PROGRESSION_SIGNALS.EXECUTION;
  if (/\b(test|smoke|regression|validate|check|verify|run)\b/i.test(t)) return PROGRESSION_SIGNALS.TESTING;
  if (/\b(explain|what does this mean|clarify|break down|what is)\b/i.test(t)) return PROGRESSION_SIGNALS.CLARIFICATION;
  if (/\b(strategy|commercial|market|buyer|position|offer|revenue)\b/i.test(t)) return PROGRESSION_SIGNALS.STRATEGY;
  if (/\b(recover|fallback|loop|stuck|reset|repair)\b/i.test(t)) return PROGRESSION_SIGNALS.RECOVERY;
  if (/\b(summary|recap|compress|brief)\b/i.test(t)) return PROGRESSION_SIGNALS.SUMMARY;
  return firstText(carry.lastUserIntent, carry.signal, carry.lastSignal, PROGRESSION_SIGNALS.UNKNOWN);
}

function detectProgressionPhase(text = "", context = {}) {
  const t = lower(text).replace(/[_-]+/g, " ");
  if (/\b(phase 1|signal detection|progression signal)\b/i.test(t)) return "phase1";
  if (/\b(phase 2|continuity memory|progression memory|memory and continuity)\b/i.test(t)) return "phase2";
  if (/\b(phase 3|response shaping|shaping rules|reply shaping|under answer|under answering|thin reply|one word)\b/i.test(t)) return "phase3";
  if (/\b(phase 4|regression telemetry|regression tests?|telemetry)\b/i.test(t)) return "phase4";
  const c = safeObj(context);
  const carry = extractProgressionCarry(c);
  return firstText(carry.phaseKey, carry.currentStep, carry.currentPhase, c.phaseKey, "phase3");
}

function isProgressionRelevant(text = "", context = {}) {
  const t = lower(text).replace(/[_-]+/g, " ");
  const c = safeObj(context);
  const carry = extractProgressionCarry(c);
  if (/\b(progression shaping|progression refinement|progression signal|continuity memory|response shaping|phase 1|phase 2|phase 3|phase 4)\b/i.test(t)) return true;
  if (/^\s*(next steps?|what now|what'?s next|passed|failed|continue|carry on|keep going|proceed)\s*[.!?]*\s*$/i.test(t)) return !!(carry.active || safeObj(c.progressionShapingGuard).active || /progression_shaping_refinement/i.test(firstText(c.activeLane, c.currentLane, c.activeProject, c.lastTopic, carry.activePhase, carry.lane)));
  return !!(carry.active || safeObj(c.progressionShapingGuard).active || /progression_shaping_refinement/i.test(firstText(c.activeLane, c.currentLane, c.activeProject, c.lastTopic)));
}

function responseShapeForSignal(signal = "", phaseKey = "") {
  if (signal === PROGRESSION_SIGNALS.FAIL || signal === PROGRESSION_SIGNALS.RECOVERY) return "recovery_mode";
  if (signal === PROGRESSION_SIGNALS.PASS || signal === PROGRESSION_SIGNALS.TESTING) return "test_mode";
  if (signal === PROGRESSION_SIGNALS.EXECUTION || signal === PROGRESSION_SIGNALS.NEXT_STEPS || signal === PROGRESSION_SIGNALS.CONTINUE) return "build_mode";
  if (signal === PROGRESSION_SIGNALS.STRATEGY) return "strategy_mode";
  if (signal === PROGRESSION_SIGNALS.CLARIFICATION || signal === PROGRESSION_SIGNALS.SUMMARY) return "summary_mode";
  if (phaseKey === "phase4") return "test_mode";
  return "build_mode";
}

function buildProgressionProfile(text = "", context = {}) {
  const active = isProgressionRelevant(text, context);
  const phaseKey = detectProgressionPhase(text, context);
  const signal = detectProgressionSignal(text, context);
  const phase = PROGRESSION_PHASES[phaseKey] || PROGRESSION_PHASES.phase3;
  const confidence = active ? (signal === PROGRESSION_SIGNALS.UNKNOWN ? 0.66 : 0.92) : 0;
  return {
    version: PROGRESSION_SHAPING_REFINEMENT_VERSION,
    active,
    lane: active ? "progression_shaping_refinement" : "",
    activePhase: active ? "progression_shaping_refinement" : "",
    phaseKey: phase.key,
    currentStep: phase.key,
    phaseId: phase.id,
    phaseLabel: phase.label,
    objective: phase.objective,
    signal,
    lastUserIntent: signal,
    responseShape: responseShapeForSignal(signal, phase.key),
    confidence: clamp01(confidence),
    noUserFacingDiagnostics: true,
    updatedAt: Date.now()
  };
}

module.exports = {
  VERSION,
  PROGRESSION_SHAPING_REFINEMENT_VERSION,
  PROGRESSION_SIGNALS,
  PROGRESSION_PHASES,
  extractProgressionCarry,
  detectProgressionSignal,
  detectProgressionPhase,
  isProgressionRelevant,
  responseShapeForSignal,
  buildProgressionProfile,
  default: buildProgressionProfile
};

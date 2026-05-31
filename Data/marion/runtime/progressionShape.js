"use strict";

const VERSION = "progressionShape v1.0.0 FOUR-PHASE-PROGRESSION-SHAPING-REFINEMENT";
const PROGRESSION_SHAPING_REFINEMENT_VERSION = "nyx.marion.progressionShapingRefinement/1.0";

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
    objective: "Detect whether the user is asking for next steps, execution, testing, recovery, clarification, or summary without reopening a broad menu."
  }),
  phase2: Object.freeze({
    id: "PHASE_2_CONTINUITY_MEMORY",
    key: "phase2",
    label: "Phase 2: Progression memory and continuity",
    objective: "Carry the active progression lane, current phase, last action, pending action, and pass/fail state across follow-up turns."
  }),
  phase3: Object.freeze({
    id: "PHASE_3_RESPONSE_SHAPING",
    key: "phase3",
    label: "Phase 3: Response shaping rules",
    objective: "Shape the reply for build, debug, test, recovery, or strategy mode so Marion gives the right next move for the moment."
  }),
  phase4: Object.freeze({
    id: "PHASE_4_REGRESSION_TELEMETRY",
    key: "phase4",
    label: "Phase 4: Regression tests and telemetry",
    objective: "Validate the full progression path and expose internal phase metadata without leaking diagnostics to the public reply."
  })
});

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function lower(value) { return safeStr(value).toLowerCase(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback; }
function firstText() { for (let i = 0; i < arguments.length; i += 1) { const v = safeStr(arguments[i]); if (v) return v; } return ""; }

function detectProgressionSignal(text = "", context = {}) {
  const t = lower(text);
  if (!t) return PROGRESSION_SIGNALS.UNKNOWN;
  if (/\b(pass(?:ed)?|all passed|green|success|works|complete|locked)\b/i.test(t)) return PROGRESSION_SIGNALS.PASS;
  if (/\b(fail(?:ed)?|error|broke|not working|red|still failing|didn'?t pass|issue)\b/i.test(t)) return PROGRESSION_SIGNALS.FAIL;
  if (/\b(next steps?|what now|what'?s next|next phase|after that|move on|continue|carry on|keep going)\b/i.test(t)) return PROGRESSION_SIGNALS.NEXT_STEPS;
  if (/\b(update|patch|fix|make the change|apply|resend|zip|downloadable|replace)\b/i.test(t)) return PROGRESSION_SIGNALS.EXECUTION;
  if (/\b(test|smoke|regression|validate|check|verify|run)\b/i.test(t)) return PROGRESSION_SIGNALS.TESTING;
  if (/\b(explain|what does this mean|clarify|break down|what is)\b/i.test(t)) return PROGRESSION_SIGNALS.CLARIFICATION;
  if (/\b(strategy|commercial|market|buyer|position|offer|revenue)\b/i.test(t)) return PROGRESSION_SIGNALS.STRATEGY;
  if (/\b(recover|fallback|loop|stuck|reset|repair)\b/i.test(t)) return PROGRESSION_SIGNALS.RECOVERY;
  if (/\b(summary|recap|compress|short version|brief)\b/i.test(t)) return PROGRESSION_SIGNALS.SUMMARY;
  const c = safeObj(context);
  return firstText(c.lastSignal, safeObj(c.progressionRefinement).lastSignal, "") || PROGRESSION_SIGNALS.UNKNOWN;
}

function detectProgressionPhase(text = "", context = {}) {
  const t = lower(text).replace(/[_-]+/g, " ");
  if (/\b(phase 1|signal detection|progression signal)\b/i.test(t)) return "phase1";
  if (/\b(phase 2|continuity memory|progression memory|memory and continuity)\b/i.test(t)) return "phase2";
  if (/\b(phase 3|response shaping|shaping rules|reply shaping)\b/i.test(t)) return "phase3";
  if (/\b(phase 4|regression telemetry|regression tests?|telemetry)\b/i.test(t)) return "phase4";
  const c = safeObj(context), pr = safeObj(c.progressionRefinement || c.progressionMemory || c.phaseAnchor);
  return firstText(pr.phaseKey, pr.currentPhase, c.phaseKey, "phase1");
}

function isProgressionRelevant(text = "", context = {}) {
  const t = lower(text).replace(/[_-]+/g, " ");
  if (/\b(progression shaping|progression refinement|progression signal|continuity memory|response shaping|phase 1|phase 2|phase 3|phase 4|next steps|passed|failed|continue|what now)\b/i.test(t)) return true;
  const c = safeObj(context);
  return !!(safeObj(c.progressionRefinement).active || safeObj(c.progressionShapingGuard).active || /progression_shaping_refinement/i.test(firstText(c.activeLane, c.currentLane, c.activeProject, c.lastTopic)));
}

function responseShapeForSignal(signal = "", phaseKey = "") {
  if (signal === PROGRESSION_SIGNALS.FAIL) return "recovery_mode";
  if (signal === PROGRESSION_SIGNALS.PASS) return "test_mode";
  if (signal === PROGRESSION_SIGNALS.TESTING) return "test_mode";
  if (signal === PROGRESSION_SIGNALS.EXECUTION) return "build_mode";
  if (signal === PROGRESSION_SIGNALS.STRATEGY) return "strategy_mode";
  if (signal === PROGRESSION_SIGNALS.CLARIFICATION) return "summary_mode";
  if (phaseKey === "phase4") return "test_mode";
  return "build_mode";
}

function buildProgressionProfile(text = "", context = {}) {
  const active = isProgressionRelevant(text, context);
  const phaseKey = detectProgressionPhase(text, context);
  const signal = detectProgressionSignal(text, context);
  const phase = PROGRESSION_PHASES[phaseKey] || PROGRESSION_PHASES.phase1;
  const confidence = active ? (signal === PROGRESSION_SIGNALS.UNKNOWN ? 0.64 : 0.88) : 0;
  return {
    version: PROGRESSION_SHAPING_REFINEMENT_VERSION,
    active,
    lane: active ? "progression_shaping_refinement" : "",
    phaseKey: phase.key,
    phaseId: phase.id,
    phaseLabel: phase.label,
    objective: phase.objective,
    signal,
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
  detectProgressionSignal,
  detectProgressionPhase,
  isProgressionRelevant,
  responseShapeForSignal,
  buildProgressionProfile,
  default: buildProgressionProfile
};

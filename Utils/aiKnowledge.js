"use strict";

/**
 * Utils/aiKnowledge.js
 *
 * AI Knowledge bridge for Marion/Nyx.
 * FAIL-OPEN, side-effect-free, no fs, no index.js imports.
 *
 * Provides:
 *  - PACK_FILES (meta only)
 *  - getMarionHints({ features, tokens, queryKey }, ctx) -> bounded hints for marionSO.js
 *  - query(...) alias for compatibility
 *
 * v1.0.0
 */

const AIK_VERSION = "aiKnowledge v1.0.0";

// -------------------------
// Pack registry (meta only)
// -------------------------
const PACK_FILES = Object.freeze({
  foundations: "ai_foundations_v1.json",
  agentsSystems: "ai_agents_systems_v1.json",
  ethicsLaw: "ai_ethics_law_v1.json",
  aiPsychology: "ai_ai_psychology_v1.json",
  aiCybersecurity: "ai_ai_cybersecurity_v1.json",
  aiMarketing: "ai_ai_marketing_v1.json",
  caseStudies: "ai_case_studies_v1.json",
  faces: "ai_face_examples_v1.json",
  dialogue: "ai_dialogue_snippets_v1.json",
});

// -------------------------
// helpers (bounded + safe)
// -------------------------
function safeStr(x, max = 200) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
  );
}
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
function uniqBounded(arr, max = 8, itemMaxLen = 64) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const v = safeStr(it, itemMaxLen).trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
function lowerTokens(tokens, max = 20) {
  const out = [];
  const seen = new Set();
  for (const t of Array.isArray(tokens) ? tokens : []) {
    const v = safeStr(t, 40).trim().toLowerCase();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

// -------------------------
// lightweight token routing
// -------------------------
function scoreTokens(toks, needles) {
  let score = 0;
  for (const n of needles) {
    if (!n) continue;
    if (toks.includes(n)) score += 1;
  }
  return score;
}

function classifyFocus(features, tokens) {
  const t = lowerTokens(tokens, 28);
  const lane = safeStr(features?.lane || "", 32).toLowerCase();
  const intent = safeStr(features?.intent || "", 16).toUpperCase();

  // Core AI signals
  const sFound = scoreTokens(t, [
    "ai",
    "artificial_intelligence",
    "artificial intelligence",
    "machine learning",
    "ml",
    "deep learning",
    "neural",
    "model",
    "training",
    "inference",
    "probability",
    "bayes",
    "bayesian",
    "search",
    "planning",
    "reinforcement",
    "rl",
  ]);

  const sAgents = scoreTokens(t, [
    "agent",
    "agents",
    "ai agent",
    "multi-agent",
    "tool",
    "tools",
    "orchestration",
    "planner",
    "planning",
    "state",
    "policy",
    "memory",
    "rag",
    "retrieval",
    "embedding",
    "function calling",
    "workflow",
  ]);

  const sEthicsLaw = scoreTokens(t, [
    "ethics",
    "governance",
    "alignment",
    "bias",
    "fairness",
    "privacy",
    "consent",
    "audit",
    "explainability",
    "xai",
    "compliance",
    "law",
    "legal",
    "copyright",
    "ip",
    "liability",
  ]);

  const sCyber = scoreTokens(t, [
    "security",
    "cyber",
    "infosec",
    "threat",
    "phish",
    "malware",
    "adversarial",
    "adversarial ml",
    "model theft",
    "prompt injection",
    "data poisoning",
    "red team",
    "defensive",
  ]);

  const sPsych = scoreTokens(t, [
    "psychology",
    "cognitive",
    "behavior",
    "human",
    "hci",
    "trust",
    "calibration",
    "persuasion",
    "nudges",
    "decision",
    "human-in-the-loop",
  ]);

  const sMkt = scoreTokens(t, [
    "marketing",
    "ads",
    "attribution",
    "segmentation",
    "recommendation",
    "recommender",
    "clv",
    "ltv",
    "cac",
    "funnel",
    "creative",
    "copy",
    "campaign",
    "brand",
  ]);

  // Lane nudges (if your router already sets lane="ai", this is extra stability)
  const laneBoost = lane === "ai" ? 1 : 0;

  const scores = [
    { k: "foundations", v: sFound + laneBoost },
    { k: "agentsSystems", v: sAgents + laneBoost },
    { k: "ethicsLaw", v: sEthicsLaw + laneBoost },
    { k: "aiCybersecurity", v: sCyber + laneBoost },
    { k: "aiPsychology", v: sPsych + laneBoost },
    { k: "aiMarketing", v: sMkt + laneBoost },
  ].sort((a, b) => b.v - a.v);

  const top = scores[0] || { k: "foundations", v: 0 };

  // If nothing matches, fall back to foundations for CLARIFY and agents for ADVANCE (practical bias)
  let focusKey = top.v > 0 ? top.k : intent === "ADVANCE" ? "agentsSystems" : "foundations";

  // Safety: if ethics/legal keywords present, override focus to ethicsLaw
  if (sEthicsLaw >= 2) focusKey = "ethicsLaw";

  return { focusKey, scores };
}

function buildHints(focusKey, scores, features) {
  const intent = safeStr(features?.intent || "", 16).toUpperCase();
  const mode = safeStr(features?.mode || "", 16).toLowerCase();
  const riskTier = safeStr(features?.riskTier || "", 12).toLowerCase();

  const packs = {
    foundations: PACK_FILES.foundations,
    agentsSystems: PACK_FILES.agentsSystems,
    ethicsLaw: PACK_FILES.ethicsLaw,
    aiPsychology: PACK_FILES.aiPsychology,
    aiCybersecurity: PACK_FILES.aiCybersecurity,
    aiMarketing: PACK_FILES.aiMarketing,
    caseStudies: PACK_FILES.caseStudies,
    faces: PACK_FILES.faces,
    dialogue: PACK_FILES.dialogue,
  };

  // Bounded cue sets
  const principlesCommon = [
    "Define the task: inputs, outputs, constraints.",
    "Separate data quality issues from model issues.",
    "State assumptions; test sensitivity.",
    "Prefer measurable evaluation over vibes.",
  ];

  const frameworksCommon = [
    "Problem framing → baseline → model → evaluation → deployment → monitoring",
    "Bias/harms: identify stakeholders → impacts → mitigations → audits",
    "Agent loop: perceive → plan → act → verify → log",
  ];

  // Response cues: tuned for Marion → Nyx handoff
  const responseCues = [];
  if (intent === "CLARIFY") responseCues.push("Ask 1–2 precise clarifying questions first.");
  if (intent === "ADVANCE") responseCues.push("Give a stepwise plan with checkpoints.");
  if (mode === "architect") responseCues.push("Use implementation-grade language and contracts.");
  if (riskTier === "high") responseCues.push("Avoid operational detail; offer safe alternatives.");

  // Focus-specific
  let focus = "";
  let stance = "educational";
  let principleAdds = [];
  let frameworkAdds = [];
  let exampleTypes = [];

  switch (focusKey) {
    case "agentsSystems":
      focus = "AI agents, planning, tool-use, orchestration, RAG/memory patterns.";
      principleAdds = [
        "Prefer deterministic scaffolding (contracts, schemas, governors).",
        "Treat tools as untrusted: validate inputs/outputs.",
      ];
      frameworkAdds = ["ReAct / Plan-Execute-Verify", "RAG: retrieve → ground → answer → cite"];
      exampleTypes = ["agent_loop", "tool_routing", "prompt_contract"];
      break;

    case "ethicsLaw":
      focus = "AI ethics, governance, privacy, legal risk, and compliance posture.";
      stance = "non-legal, risk-aware";
      principleAdds = [
        "Minimize personal data; avoid unnecessary retention.",
        "Explain limits; avoid implying professional advice.",
      ];
      frameworkAdds = ["Data lifecycle mapping", "Risk register + mitigations", "Human oversight gates"];
      exampleTypes = ["policy_checklist", "governance_template", "risk_matrix"];
      break;

    case "aiCybersecurity":
      focus = "Defensive AI security: adversarial ML awareness, prompt injection defenses, monitoring.";
      stance = "defensive-first";
      principleAdds = [
        "Assume prompt injection; isolate tools and restrict permissions.",
        "Log safely: no secrets, no PII; monitor drift and anomalies.",
      ];
      frameworkAdds = ["Threat modeling for AI systems", "Secure-by-default agent design"];
      exampleTypes = ["defensive_controls", "monitoring_plan", "red_flags_list"];
      break;

    case "aiPsychology":
      focus = "Human factors: trust calibration, cognitive load, HCI, decision support.";
      principleAdds = [
        "Calibrate confidence: separate known/unknown.",
        "Design for human override and auditability.",
      ];
      frameworkAdds = ["Trust calibration loop", "Human-in-the-loop decision workflow"];
      exampleTypes = ["ui_copy_patterns", "calibration_examples", "handoff_guidelines"];
      break;

    case "aiMarketing":
      focus = "AI in digital marketing: segmentation, recommendation, attribution, creative ops.";
      principleAdds = [
        "Avoid leakage: separate training from evaluation by time/user.",
        "Measure uplift; don’t confuse correlation with causation.",
      ];
      frameworkAdds = ["Experiment design (A/B, holdouts)", "Funnel model + LTV/CAC linkage"];
      exampleTypes = ["campaign_playbook", "metric_tree", "recommendation_case"];
      break;

    case "foundations":
    default:
      focus = "AI foundations: search, probability, ML basics, evaluation, and core concepts.";
      principleAdds = [
        "Start with a baseline (heuristic, linear model, rules).",
        "Choose metrics aligned to failure modes.",
      ];
      frameworkAdds = ["Bias-variance + data-centric iteration", "Train/validate/test discipline"];
      exampleTypes = ["concept_explainer", "toy_problem", "evaluation_template"];
      break;
  }

  // Confidence heuristic from score spread
  const top = scores && scores[0] ? scores[0].v : 0;
  const second = scores && scores[1] ? scores[1].v : 0;
  const confidence = clamp01(0.35 + Math.min(0.6, Math.max(0, top - second) * 0.08 + top * 0.04));

  // "hits" are short, safe labels (no raw text)
  const hits = [];
  if (focusKey === "agentsSystems") hits.push("agents", "planning", "tools", "rag");
  if (focusKey === "ethicsLaw") hits.push("governance", "privacy", "bias");
  if (focusKey === "aiCybersecurity") hits.push("defensive", "prompt_injection", "monitoring");
  if (focusKey === "aiPsychology") hits.push("trust", "human_in_loop", "cognitive_load");
  if (focusKey === "aiMarketing") hits.push("segmentation", "attribution", "uplift");
  if (focusKey === "foundations") hits.push("basics", "evaluation", "ml");

  return {
    enabled: true,
    packs: {
      // include a primary pack + a couple related packs, bounded
      primary: packs[focusKey],
      related: uniqBounded(
        [
          focusKey !== "foundations" ? packs.foundations : "",
          focusKey !== "agentsSystems" ? packs.agentsSystems : "",
          focusKey !== "ethicsLaw" ? packs.ethicsLaw : "",
        ].filter(Boolean),
        3,
        48
      ),
      versions: PACK_FILES,
    },
    focus: safeStr(focus, 80),
    stance: safeStr(stance, 40),
    principles: uniqBounded(principlesCommon.concat(principleAdds), 8, 96),
    frameworks: uniqBounded(frameworksCommon.concat(frameworkAdds), 6, 96),
    guardrails: uniqBounded(
      [
        "No raw user text in traces.",
        "Prefer bounded outputs (bullets, short steps).",
        "If asked for professional advice, reframe to education + suggest pro.",
      ],
      6,
      96
    ),
    exampleTypes: uniqBounded(exampleTypes, 6, 40),
    responseCues: uniqBounded(responseCues, 8, 96),
    hits: uniqBounded(hits, 10, 32),
    confidence,
    reason: safeStr(`focus=${focusKey}`, 60),
  };
}

// -------------------------
// API: getMarionHints
// -------------------------
function getMarionHints(query, ctx) {
  const q = isPlainObject(query) ? query : {};
  const features = isPlainObject(q.features) ? q.features : {};
  const tokens = lowerTokens(q.tokens, 40);

  // fail-open defaults
  const base = {
    enabled: true,
    queryKey: safeStr(q.queryKey || "", 18),
    packs: { versions: PACK_FILES },
    focus: "AI: general guidance.",
    stance: "educational",
    principles: [],
    frameworks: [],
    guardrails: [],
    exampleTypes: [],
    responseCues: [],
    hits: [],
    confidence: 0.25,
    reason: "default",
  };

  try {
    const { focusKey, scores } = classifyFocus(features, tokens);
    const hints = buildHints(focusKey, scores, features);
    return {
      ...hints,
      queryKey: safeStr(q.queryKey || "", 18),
    };
  } catch (e) {
    return {
      ...base,
      enabled: false,
      confidence: 0,
      reason: safeStr(`fail_open:${(e && (e.code || e.name)) || "ERR"}`, 60),
    };
  }
}

// Compatibility alias
function query(q, ctx) {
  return getMarionHints(q, ctx);
}

module.exports = {
  AIK_VERSION,
  PACK_FILES,
  getMarionHints,
  query,
};

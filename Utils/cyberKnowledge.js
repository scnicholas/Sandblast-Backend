"use strict";

/**
 * Utils/cyberKnowledge.js
 *
 * Cybersecurity Knowledge Retrieval Layer
 *
 * Responsibilities:
 *  - Load domain packs from /Data/Domains/cybersecurity/packs
 *  - Cache packs (mtime-based)
 *  - Provide deterministic retrieval functions
 *  - Enforce defensive-only posture via safety_and_posture pack
 *  - Provide Marion-safe hint API (NO raw user text required)
 *  - Weighted scoring between packs and item-types (packs compete)
 *
 * NOT responsible for:
 *  - Tone
 *  - Reply composition
 *  - Session mutation
 *  - Express/server logic
 *
 * MarionSO may query this module in mediator-safe mode.
 */

const fs = require("fs");
const path = require("path");

// =========================
// CONFIG
// =========================

const DOMAIN_DIR = path.resolve(
  __dirname,
  "..",
  "Data",
  "Domains",
  "cybersecurity",
  "packs"
);

const CYBER_K_VERSION = "cyberKnowledge v1.0.0";

// canonical pack files we expect (but loader is tolerant)
const PACK_FILES = Object.freeze({
  safetyPosture: "cyber_safety_and_posture_v1.json",
  sourceLadder: "cyber_source_ladder_v1.json",
  foundations: "cyber_foundations_v1.json",
  identityAccess: "cyber_identity_access_v1.json",
  endpointCloud: "cyber_endpoint_cloud_v1.json",
  incidentResponse: "cyber_incident_response_v1.json",
  networkWeb: "cyber_network_web_v1.json",
  privacyData: "cyber_privacy_data_protection_v1.json",
  securityCulture: "cyber_security_culture_v1.json",
  // examples
  faceExamples: "cyber_face_examples_v1.json"
});

// =========================
// INTERNAL CACHE
// =========================

let _packCache = {
  mtimeMap: {},
  packs: {}
};

// =========================
// HELPERS
// =========================

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function safeReadJSON(file) {
  try {
    const txt = fs.readFileSync(file, "utf8");
    const clean = txt && txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt;
    return JSON.parse(clean);
  } catch (_e) {
    return null;
  }
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch (_e) {
    return null;
  }
}

function safeStr(x, max = 200) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function uniqBounded(arr, max = 8, eachMax = 80) {
  const out = [];
  const seen = new Set();
  for (const it of Array.isArray(arr) ? arr : []) {
    const v = safeStr(it, eachMax).trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function safeTokenSet(tokens, max = 12) {
  const out = [];
  const seen = new Set();
  for (const t of Array.isArray(tokens) ? tokens : []) {
    const v = safeStr(t, 32).trim().toLowerCase();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// =========================
// PACK LOADER
// =========================

function loadPack(fileName) {
  const fullPath = path.join(DOMAIN_DIR, fileName);
  const stat = safeStat(fullPath);
  if (!stat || !stat.isFile()) return null;

  const mtime = Number(stat.mtimeMs || 0);

  if (_packCache.packs[fileName] && _packCache.mtimeMap[fileName] === mtime) {
    return _packCache.packs[fileName];
  }

  const data = safeReadJSON(fullPath);
  if (!data) return null;

  _packCache.packs[fileName] = data;
  _packCache.mtimeMap[fileName] = mtime;

  return data;
}

function loadAllPacks() {
  let files = [];
  try {
    files = fs.readdirSync(DOMAIN_DIR);
  } catch (_e) {
    return [];
  }

  const packs = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const pack = loadPack(file);
    if (pack) packs.push(pack);
  }
  return packs;
}

function getPackVersions() {
  // lightweight versions for Marion hints
  const out = {};
  const keys = Object.keys(PACK_FILES);
  for (const k of keys) {
    const f = PACK_FILES[k];
    const p = loadPack(f);
    out[k] = p && (p.packId || p.id || f) ? safeStr(p.packId || p.id || f, 48) : "";
  }
  return out;
}

// =========================
// SAFETY / POSTURE
// =========================

function getSafetyPosturePack() {
  const pack = loadPack(PACK_FILES.safetyPosture);
  if (!pack) return null;
  return pack;
}

function postureSummary() {
  const p = getSafetyPosturePack();
  if (!p) {
    return {
      ok: false,
      operationalMode: "defensive_only",
      allowHighLevelEducation: true,
      allowMitigationGuidance: true,
      disallowExploitDetail: true,
      disallowCircumventionSteps: true,
      reason: "missing_pack"
    };
  }

  const posture = isObject(p.posture) ? p.posture : {};
  return {
    ok: true,
    operationalMode: safeStr(posture.operationalMode || "defensive_only", 24),
    allowHighLevelEducation: !!posture.allowHighLevelEducation,
    allowMitigationGuidance: !!posture.allowMitigationGuidance,
    allowArchitectureReasoning: posture.allowArchitectureReasoning !== false,
    disallowExploitDetail: posture.disallowExploitDetail !== false,
    disallowCircumventionSteps: posture.disallowCircumventionSteps !== false,
    disallowMalwareCreation: posture.disallowMalwareCreation !== false,
    reason: ""
  };
}

function detectAdversarialIntentByText(text) {
  // Optional helper if other modules call queryCyber(text).
  // Marion-safe path DOES NOT require this.
  const input = normalizeText(text);
  const p = getSafetyPosturePack();
  const hints = (p && isObject(p.retrievalHints)) ? p.retrievalHints : null;
  const keywords = hints && Array.isArray(hints.keywords) ? hints.keywords : [];
  const intentSignals = hints && Array.isArray(hints.intentSignals) ? hints.intentSignals : [];

  let score = 0;
  for (const k of keywords) {
    const kk = normalizeText(k);
    if (kk && input.includes(kk)) score += 2;
  }
  for (const s of intentSignals) {
    const ss = normalizeText(s);
    if (ss && input.includes(ss)) score += 3;
  }

  // conservative: medium+ suggests risky
  const risky = score >= 4;
  return { risky, score };
}

// =========================
// WEIGHTED SCORING BETWEEN PACKS
// =========================

const PACK_WEIGHT = Object.freeze({
  // Safety/posture gets priority when anything looks risky.
  safetyPosture: 3.5,
  incidentResponse: 2.6,
  identityAccess: 2.2,
  endpointCloud: 2.0,
  networkWeb: 2.0,
  privacyData: 2.1,
  foundations: 1.6,
  securityCulture: 1.4,
  sourceLadder: 1.2
});

const TOKEN_MAP = Object.freeze({
  // map coarse tokens -> pack boost (deterministic)
  "risk:cyber": ["incidentResponse", "foundations"],
  "cyber:defensive_only": ["safetyPosture"],
  "cyber:redteam_block": ["safetyPosture"],
  "cyber:hardening": ["endpointCloud", "networkWeb", "identityAccess"],
  "cyber:privacy_hygiene": ["privacyData", "identityAccess"],
  "cyber:social_engineering": ["securityCulture", "identityAccess"],
  "cyber:threat_awareness": ["foundations", "incidentResponse"],
  "incident": ["incidentResponse"],
  "breach": ["incidentResponse"],
  "ransomware": ["incidentResponse", "endpointCloud"],
  "phishing": ["securityCulture", "identityAccess"],
  "iam": ["identityAccess"],
  "identity": ["identityAccess"],
  "mfa": ["identityAccess"],
  "endpoint": ["endpointCloud"],
  "edr": ["endpointCloud"],
  "cloud": ["endpointCloud"],
  "network": ["networkWeb"],
  "web": ["networkWeb"],
  "tls": ["networkWeb"],
  "privacy": ["privacyData"],
  "pii": ["privacyData"],
  "gdpr": ["privacyData"],
  "pipeda": ["privacyData"],
  "policy": ["securityCulture", "sourceLadder"],
  "governance": ["securityCulture", "sourceLadder"]
});

function scorePackCandidates(tokens) {
  const t = safeTokenSet(tokens, 20);
  const scores = {
    safetyPosture: 0,
    sourceLadder: 0,
    foundations: 0,
    identityAccess: 0,
    endpointCloud: 0,
    incidentResponse: 0,
    networkWeb: 0,
    privacyData: 0,
    securityCulture: 0
  };

  for (const tok of t) {
    const boosts = TOKEN_MAP[tok];
    if (!boosts) continue;
    for (const k of boosts) {
      if (scores[k] !== undefined) scores[k] += 1;
    }
  }

  // apply weight multipliers
  const ranked = Object.keys(scores).map((k) => {
    const base = scores[k] || 0;
    const w = PACK_WEIGHT[k] || 1.0;
    return { packKey: k, score: base * w };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function pickTopPacks(tokens, max = 2) {
  const ranked = scorePackCandidates(tokens);
  const out = [];
  for (const r of ranked) {
    if (r.score <= 0) continue;
    out.push(r.packKey);
    if (out.length >= max) break;
  }
  // always include safety posture as guardrail pack for Marion
  if (!out.includes("safetyPosture")) out.unshift("safetyPosture");
  return uniqBounded(out, 3, 24);
}

// =========================
// SNIPPET / EXAMPLES SELECTION (deterministic)
// =========================

function selectExampleTypes(tokens) {
  const t = safeTokenSet(tokens, 20);
  const types = [];

  if (t.includes("risk:cyber") || t.includes("incident") || t.includes("breach")) {
    types.push("incident_summary", "containment_steps");
  }
  if (t.includes("cyber:privacy_hygiene") || t.includes("privacy") || t.includes("pii")) {
    types.push("privacy_checklist", "data_minimization");
  }
  if (t.includes("cyber:social_engineering") || t.includes("phishing")) {
    types.push("phishing_red_flags", "verification_script");
  }
  if (t.includes("iam") || t.includes("mfa") || t.includes("identity")) {
    types.push("access_review", "least_privilege");
  }
  if (t.includes("network") || t.includes("web") || t.includes("tls")) {
    types.push("secure_baseline", "exposure_review");
  }
  if (!types.length) types.push("baseline_hardening", "risk_triage");

  return uniqBounded(types, 6, 32);
}

function packPrinciplesFor(packKey) {
  // “principles” are short prompts Marion can use to shape Nyx response
  switch (packKey) {
    case "incidentResponse":
      return ["contain first", "preserve evidence", "communicate clearly", "document timeline"];
    case "identityAccess":
      return ["least privilege", "strong auth", "review access", "log and alert"];
    case "endpointCloud":
      return ["patch fast", "reduce attack surface", "secure configs", "monitor endpoints"];
    case "networkWeb":
      return ["minimize exposure", "encrypt in transit", "segment networks", "harden edge"];
    case "privacyData":
      return ["data minimization", "purpose limitation", "access control", "breach readiness"];
    case "securityCulture":
      return ["train humans", "verify requests", "report early", "no blame learning"];
    case "foundations":
      return ["threat model", "assume breach", "defense in depth", "measure risk"];
    case "sourceLadder":
      return ["use primary sources", "cite standards", "prefer vendor docs", "verify recency"];
    case "safetyPosture":
    default:
      return ["defensive only", "no bypass guidance", "privacy first", "escalate if active incident"];
  }
}

function packFrameworksFor(packKey) {
  // a few recognizable frameworks (NOT instructions to attack)
  switch (packKey) {
    case "incidentResponse":
      return ["NIST IR lifecycle", "contain-eradicate-recover", "lessons learned"];
    case "identityAccess":
      return ["Zero Trust", "RBAC/ABAC", "MFA everywhere"];
    case "endpointCloud":
      return ["CIS Benchmarks", "secure-by-default configs", "EDR telemetry"];
    case "networkWeb":
      return ["TLS baseline", "WAF + rate limiting", "segmentation"];
    case "privacyData":
      return ["privacy-by-design", "data classification", "DLP concepts"];
    case "securityCulture":
      return ["security awareness loop", "phish reporting", "tabletop exercises"];
    case "foundations":
      return ["threat modeling", "CIA triad", "risk register"];
    case "sourceLadder":
      return ["source ladder", "standards-first research"];
    case "safetyPosture":
    default:
      return ["defensive-only posture", "harm minimization"];
  }
}

function packGuardrails(posture) {
  const g = [
    "no exploit or bypass steps",
    "no malware creation",
    "no social engineering assistance",
    "minimize sensitive data"
  ];
  if (posture && posture.operationalMode === "defensive_only") g.unshift("defensive only");
  return uniqBounded(g, 6, 40);
}

// =========================
// MARION-SAFE HINTS API (NO RAW TEXT REQUIRED)
// =========================

/**
 * getMarionHints(query, ctx)
 *
 * query: {
 *   tokens: [..], queryKey: string, features?: {...}
 * }
 *
 * Returns bounded hints for Marion -> chatEngine:
 * {
 *   enabled, queryKey,
 *   packs: { safetyPosture, topPacks: [...] , versions: {...} }
 *   focus, stance, principles, frameworks, guardrails, exampleTypes,
 *   responseCues, hits, confidence, reason
 * }
 */
function getMarionHints(query, _ctx) {
  const q = isObject(query) ? query : {};
  const tokens = safeTokenSet(q.tokens || [], 18);

  const posture = postureSummary();
  const topPacks = pickTopPacks(tokens, 2);

  // Determine focus/stance
  let focus = "baseline_security";
  let stance = "defensive+structured";

  if (tokens.includes("cyber:redteam_block") || tokens.includes("risk:illegal")) {
    focus = "posture_enforcement";
    stance = "contain+redirect";
  } else if (tokens.includes("incident") || tokens.includes("breach") || tokens.includes("ransomware")) {
    focus = "incident_response";
    stance = "contain+triage";
  } else if (tokens.includes("cyber:privacy_hygiene") || tokens.includes("privacy") || tokens.includes("pii")) {
    focus = "privacy_data_protection";
    stance = "minimize+govern";
  } else if (tokens.includes("iam") || tokens.includes("identity") || tokens.includes("mfa")) {
    focus = "identity_access";
    stance = "harden+verify";
  } else if (tokens.includes("network") || tokens.includes("web") || tokens.includes("tls")) {
    focus = "network_web_security";
    stance = "harden+reduce_exposure";
  }

  // Weighted principles/frameworks (packs compete, then merge bounded)
  const principles = [];
  const frameworks = [];

  for (const pk of topPacks) {
    principles.push(...packPrinciplesFor(pk));
    frameworks.push(...packFrameworksFor(pk));
  }

  // Always add safety posture principles as first-class guardrail influence
  principles.unshift(...packPrinciplesFor("safetyPosture"));
  frameworks.unshift(...packFrameworksFor("safetyPosture"));

  const exampleTypes = selectExampleTypes(tokens);
  const guardrails = packGuardrails(posture);

  const responseCues = uniqBounded(
    [
      "ask 1 clarifier if scope unclear",
      "offer 3 defensive options",
      "use short steps",
      "avoid step-by-step offensive detail",
      "encourage logging/monitoring",
      "escalate if active incident"
    ],
    8,
    48
  );

  // hits: concept IDs only (no prose)
  const hits = uniqBounded(
    [
      focus,
      stance,
      ...topPacks.map((p) => `pack:${p}`),
      ...exampleTypes.map((e) => `ex:${e}`)
    ],
    10,
    40
  );

  // Confidence heuristic from signal strength (deterministic)
  const signalStrength = clamp01(Math.min(1, tokens.length / 12));
  const confidence = clamp01(0.45 + signalStrength * 0.4);

  return {
    enabled: true,
    queryKey: safeStr(q.queryKey || "", 18),
    packs: {
      safetyPosture: safeStr(PACK_FILES.safetyPosture, 48),
      topPacks: uniqBounded(topPacks, 3, 24),
      versions: getPackVersions()
    },
    focus,
    stance,
    principles: uniqBounded(principles, 8, 52),
    frameworks: uniqBounded(frameworks, 6, 52),
    guardrails: uniqBounded(guardrails, 6, 52),
    exampleTypes,
    responseCues,
    hits,
    confidence,
    reason: posture.ok ? "ok" : "posture_missing_pack"
  };
}

// =========================
// OPTIONAL GENERAL API (text-based)
// =========================

/**
 * queryCyber(text)
 * Used if another layer wants to do text-based detection, but Marion-safe integration
 * should use getMarionHints() instead.
 */
function queryCyber(text) {
  const posture = postureSummary();
  const risk = detectAdversarialIntentByText(text);
  return {
    posture,
    risk
  };
}

module.exports = {
  CYBER_K_VERSION,
  PACK_FILES,
  loadPack,
  loadAllPacks,
  postureSummary,
  detectAdversarialIntentByText,
  scorePackCandidates,
  getMarionHints,
  queryCyber
};

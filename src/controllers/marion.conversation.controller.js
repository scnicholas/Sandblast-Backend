import { adaptGuardianResponse } from "../adapters/guardian.response.adapter.js";
import { rememberTurn, getGuardianMemory } from "../memory/guardian.memory.bridge.js";
import { logGuardianEvent } from "../audit/guardian.audit.logger.js";

const CONTROLLER_VERSION = "1.5.3-r18c-law-real-world-assessment";
const DEFAULT_GUARDIAN = "marion";
const DEFAULT_MODE = "admin_dialogue";
const DEFAULT_ROUTE = "marion.admin.runtime";
const MAX_INPUT_LENGTH = 8000;

function nowIso() {
  return new Date().toISOString();
}

function makeTraceId(prefix = "marion") {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return `${prefix}_${cryptoRef.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value, max = MAX_INPUT_LENGTH) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function safeGuardian(value) {
  const v = cleanText(value || DEFAULT_GUARDIAN, 64).toLowerCase();
  if (v === "mariam") return "marion";
  if (v === "astro") return "aster";
  if (v === "fallon") return "thalon";
  return ["marion", "aster", "thalon"].includes(v) ? v : DEFAULT_GUARDIAN;
}

function safeError(error) {
  if (!error) return { message: "Unknown runtime error." };
  const data = error.data && typeof error.data === "object" ? error.data : null;
  return {
    name: cleanText(error.name || "RuntimeError", 80),
    message: cleanText(error.message || data?.message || data?.error || "The turn did not complete cleanly.", 500),
    status: error.status || data?.status || null,
    code: data?.code || data?.error || null
  };
}

function ensurePacketShape(packet = {}, fallback = {}) {
  const traceId = cleanText(packet.traceId || fallback.traceId || makeTraceId("marion"), 120);
  return {
    guardian: safeGuardian(packet.guardian || fallback.guardian),
    guardianMode: safeGuardian(packet.guardianMode || fallback.guardianMode),
    directReply: cleanText(packet.directReply || fallback.directReply || "Marion returned without a clean reply.", 4000),
    contextSummary: cleanText(packet.contextSummary || fallback.contextSummary || "No context summary exposed yet.", 2000),
    currentObjective: cleanText(packet.currentObjective || fallback.currentObjective || "Maintain Marion admin continuity.", 1000),
    systemState: cleanText(packet.systemState || fallback.systemState || "unknown", 64).toLowerCase(),
    nextAction: cleanText(packet.nextAction || fallback.nextAction || "Review runtime output and continue validation.", 1000),
    riskLevel: cleanText(packet.riskLevel || fallback.riskLevel || "low", 32).toLowerCase(),
    approvalRequired: Boolean(packet.approvalRequired),
    traceId,
    timestamp: cleanText(packet.timestamp || fallback.timestamp || nowIso(), 80),
    route: cleanText(packet.route || fallback.route || DEFAULT_ROUTE, 120),
    rawRuntimeAvailable: packet.rawRuntimeAvailable !== false,
    controllerVersion: CONTROLLER_VERSION,
    r17cStability: true,
    voiceTextParity: true,
    longSessionStressGuard: true,
    finalBaseline: "r16m-r17b",
    r18CLawRealWorldAssessment: false,
    lawAssessmentFrame: "",
    legalCategory: "",
    jurisdictionSensitivity: false,
    legalAdviceBoundary: "",
    legalRiskLevel: "low",
    legalRiskBoundary: {},
    factsAssumptionsSeparated: false,
    professionalReviewRecommended: false,
    lawCrossDomainSecondaryLane: "",
    lawShortPromptLaneInheritance: false,
    legalSourceDocumentCheckRequired: false,
    noLegalCertaintyClaim: true,
    noAttorneyClientRelationship: true
  };
}


function r17aKind(input) {
  const t = cleanText(input, 600).toLowerCase();
  if (/frustr|stuck|annoyed|tired|not working/.test(t)) return "strained";
  if (/pass|good|held|works/.test(t)) return "positive";
  if (/still there|are you there|you there/.test(t)) return "presence";
  return "steady";
}


function r18CLawProfile(input = "", memory = {}, packet = {}) {
  const assessmentText = cleanText(`${input} ${memory.lastTopic || ""} ${memory.currentObjective || ""} ${memory.activeFeatureLane || ""}`, 5000).toLowerCase();
  const text = cleanText(`${assessmentText} ${packet.directReply || ""} ${packet.contextSummary || ""}`, 5000).toLowerCase();
  const secondaryText = assessmentText;
  const law = /\b(law|legal|lawyer|attorney|counsel|court|sue|lawsuit|claim|liability|liable|negligence|damages|indemnity|contract|agreement|nda|terms|license|licence|licensing|copyright|trademark|patent|intellectual property|\bip\b|royalty|distribution rights|broadcast rights|ott|ctv|roku|compliance|regulatory|regulation|jurisdiction|statute|privacy policy|data protection|consent|employment|contractor|lease|permit|filing|incorporation|shareholder|bylaw)\b/.test(text);
  const short = r18ShortPromptKind(input);
  const lawCarry = /\blaw(?:_|\b)|legal|licensing|contract|compliance|liability|copyright/.test(String(memory.activeFeatureLane || "").toLowerCase()) || packet.r18CLawRealWorldAssessment === true;
  const active = law || Boolean(short && lawCarry);
  let legalCategory = "general_legal_risk";
  if (/\b(copyright|licen[cs]e|licensing|royalty|distribution rights|broadcast rights|ott|ctv|roku|content rights|monetiz)\b/.test(text)) legalCategory = "copyright_licensing";
  else if (/\b(contract|agreement|nda|terms|indemnity|warranty|breach|clause|deliverable|scope of work|sow)\b/.test(text)) legalCategory = "contract";
  else if (/\b(trademark|patent|intellectual property|\bip\b|brand|mark|copyright registration)\b/.test(text)) legalCategory = "ip_trademark_patent";
  else if (/\b(compliance|regulatory|regulation|permit|filing|statute|corporate|incorporation|bylaw|shareholder)\b/.test(text)) legalCategory = "compliance_regulatory";
  else if (/\b(liability|liable|lawsuit|sue|claim|damages|negligence|dispute|settlement|cease and desist)\b/.test(text)) legalCategory = "liability_dispute";
  else if (/\b(employment|employee|contractor|workplace|termination|severance|non[- ]?compete|non[- ]?solicit)\b/.test(text)) legalCategory = "employment_contractor";
  else if (/\b(privacy|data protection|personal information|consent|gdpr|pipeda|security breach|breach notice)\b/.test(text)) legalCategory = "privacy_data";
  else if (/\b(jurisdiction|court|tribunal|filing|procedure|venue|province|state|federal)\b/.test(text)) legalCategory = "jurisdiction_procedure";
  else if (/\b(business|company|corporation|client|vendor|platform|revenue|advertising|grant|tax|funding)\b/.test(text)) legalCategory = "corporate_business";
  let legalRiskLevel = "medium";
  if (/\b(criminal|fraud|illegal|injunction|court order|subpoena|regulator investigation|urgent filing|arrest)\b/.test(text)) legalRiskLevel = "critical";
  else if (/\b(lawsuit|sue|claim|damages|infringement|breach|terminate|indemnity|privacy breach|personal data|cease and desist|penalty|fine)\b/.test(text)) legalRiskLevel = "high";
  else if (/\b(contract|licen[cs]e|copyright|compliance|liability|jurisdiction|rights|regulation|privacy|employment)\b/.test(text)) legalRiskLevel = "medium";
  else legalRiskLevel = active ? "low" : "low";
  const secondary = [];
  if (/\b(ai|artificial intelligence|model|agent|llm|automation|prompt|tool)\b/.test(secondaryText)) secondary.push("ai");
  if (/\b(cyber|security|identity|access|secret|credential|token|auth|permission|privacy|data protection|breach)\b/.test(secondaryText)) secondary.push("cyber");
  if (/\b(finance|revenue|tax|cost|grant|funding|valuation|royalty|ads|monetiz|liability exposure)\b/.test(secondaryText)) secondary.push("finance");
  if (/\b(business|client|vendor|platform|ott|ctv|roku|distribution|commercial|corporation)\b/.test(secondaryText)) secondary.push("business");
  return { active, law, short, lawCarry, legalCategory, legalRiskLevel, secondary, jurisdictionSensitivity: active };
}

function r18CLawLaneName(profile = {}) {
  const s = Array.isArray(profile.secondary) ? profile.secondary : [];
  if (s.includes("ai") && s.includes("cyber")) return "law_ai_cyber";
  if (s.includes("cyber")) return "law_cyber";
  if (s.includes("ai")) return "law_ai";
  if (s.includes("finance")) return "law_finance";
  if (s.includes("business")) return "law_business";
  return "law";
}

function r18CLawReply(profile = {}, input = "") {
  const kind = r18ShortPromptKind(input);
  if (kind === "pass") return "Good. The law assessment lane held. Next we test contracts, licensing, compliance, liability, jurisdiction sensitivity, and the no-legal-advice boundary without weakening R17C.";
  if (kind === "ask") return "We are on R18C: Marion's law real-world assessment layer. The lane must identify the legal category, flag jurisdiction sensitivity, separate facts from assumptions, frame risk, name missing information, and give a safe next move without pretending to provide legal advice.";
  if (kind === "next") return "Next: run law prompts through contract, licensing, compliance, liability, and jurisdiction tests. The reply must stay practical, protective, and clear that it is legal-risk triage, not legal advice.";
  if (kind === "continue") return "Keep going: law category first, jurisdiction sensitivity second, facts versus assumptions third, then risk exposure, missing information, and safe next move.";
  if (kind === "repair") return "You are right, Mac. I will pull this back to the active law assessment lane and keep the legal boundary tight.";
  if (profile.legalCategory === "copyright_licensing") return "Law assessment: this is a copyright/licensing risk question. Separate the rights you actually hold from assumptions about platform, territory, format, monetization, term, and sublicensing. If the paperwork does not clearly cover OTT/CTV/Roku distribution and ad-supported use, treat that as a risk gap and verify the license language before publishing or monetizing. This is legal-risk triage, not legal advice.";
  if (profile.legalCategory === "contract") return "Law assessment: this is a contract-risk question. Identify the clause, parties, obligations, payment terms, termination rights, indemnity language, and governing law. Do not assume enforceability from wording alone; the safe move is to compare the clause against the full agreement and jurisdiction before relying on it. This is general legal-risk assessment, not legal advice.";
  if (profile.legalCategory === "compliance_regulatory" || profile.legalCategory === "privacy_data") return "Law assessment: this is a compliance-sensitive question. Separate the actual rule or policy from assumptions, identify the jurisdiction, data or conduct involved, exposure level, and required evidence. The safe next move is to verify the governing requirement and document the compliance path before action. This is legal-risk triage, not legal advice.";
  if (profile.legalCategory === "liability_dispute") return "Law assessment: this is a liability or dispute-risk question. Separate known facts from allegations, identify duty, breach, causation, damages, contract terms, insurance, and jurisdiction. For high-risk exposure, preserve records and get professional legal review before sending threats, admissions, or final positions. This is not legal advice.";
  return "Law assessment: classify the legal category, confirm jurisdiction sensitivity, separate facts from assumptions, identify risk exposure, list missing documents or facts, and give a safe next move. Marion should provide practical legal-risk triage only, not legal advice or certainty.";
}

function applyR18CLawAssessment(shaped, input, memory = {}) {
  const profile = r18CLawProfile(input, memory, shaped);
  if (!profile.active) return shaped;
  const stale = /AI lane active|Cyber lane|AI-cyber|baseline steady|pacing, personality, and coherence|verify identity, limit access|assess goal, context, data, risk/i.test(shaped.directReply || "");
  const needsLawReply = profile.law || profile.short || stale || !/legal|law|contract|licen[cs]e|copyright|compliance|liability|jurisdiction|risk triage/i.test(shaped.directReply || "");
  if (needsLawReply) shaped.directReply = r18CLawReply(profile, input);
  shaped.r18CLawRealWorldAssessment = true;
  shaped.lawAssessmentFrame = "category_jurisdiction_facts_assumptions_risk_missing_info_safe_next_move";
  shaped.legalCategory = profile.legalCategory;
  shaped.jurisdictionSensitivity = profile.jurisdictionSensitivity;
  shaped.legalAdviceBoundary = "general_information_legal_risk_triage_not_legal_advice";
  shaped.legalRiskLevel = profile.legalRiskLevel;
  shaped.legalRiskBoundary = {
    generalInformationOnly: true,
    notLegalAdvice: true,
    noAttorneyClientRelationship: true,
    noLegalCertainty: true,
    jurisdictionRequired: true,
    verifySourceDocuments: true,
    professionalReviewRecommended: profile.legalRiskLevel === "high" || profile.legalRiskLevel === "critical"
  };
  shaped.factsAssumptionsSeparated = true;
  shaped.professionalReviewRecommended = profile.legalRiskLevel === "high" || profile.legalRiskLevel === "critical";
  shaped.lawCrossDomainSecondaryLane = profile.secondary.join("_") || "none";
  shaped.lawShortPromptLaneInheritance = Boolean(profile.short || profile.lawCarry);
  shaped.legalSourceDocumentCheckRequired = true;
  shaped.noLegalCertaintyClaim = true;
  shaped.noAttorneyClientRelationship = true;
  shaped.activeFeatureLane = r18CLawLaneName(profile);
  shaped.shortPromptLaneInheritance = Boolean(profile.short || profile.lawCarry);
  shaped.currentObjective = "Run R18C law assessment without weakening R17C or R18AB.";
  shaped.nextAction = "Classify the legal category, confirm jurisdiction, separate facts from assumptions, assess risk, identify missing documents, and give a safe next move.";
  shaped.riskLevel = profile.legalRiskLevel === "critical" ? "critical" : profile.legalRiskLevel === "high" ? "high" : shaped.riskLevel || "medium";
  shaped.approvalRequired = shaped.approvalRequired || profile.legalRiskLevel === "high" || profile.legalRiskLevel === "critical";
  return shaped;
}

function r18DomainProfile(input) {
  const t = cleanText(input, 1600).toLowerCase();
  const ai = /\b(ai|artificial intelligence|model|reasoning|agent|automation|adaptive|intelligence|llm|machine learning)\b/.test(t);
  const cyber = /\b(cyber|security|protect|identity|permission|access|token|secret|auth|authentication|authorization|least privilege|risk|threat|anomaly|credential)\b/.test(t);
  return { ai, cyber };
}


function r18ShortPromptKind(input) {
  const t = cleanText(input, 400).toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (/^(pass|passed|locked|green|success)$/.test(t)) return "pass";
  if (/^(next|next steps|what now|what's next|what is next)$/.test(t)) return "next";
  if (/^(continue|keep going|carry on|proceed)$/.test(t)) return "continue";
  if (/what were we fixing|where were we|active lane|what are we doing/.test(t)) return "ask";
  if (/frustr|stuck|annoyed|tired|wrong lane|not working/.test(t)) return "repair";
  return "";
}

function r18ActiveLane(memory = {}, packet = {}, input = "") {
  const text = cleanText(`${input} ${packet.directReply || ""} ${packet.currentObjective || ""} ${packet.contextSummary || ""} ${memory.lastTopic || ""} ${memory.currentObjective || ""} ${memory.activeFeatureLane || ""}`, 3000).toLowerCase();
  return /\b(ai|artificial intelligence|agent|model|llm|automation|cyber|security|identity|access|secret|least privilege|credential|approval|ai_cyber)\b/.test(text) || r18ShortPromptKind(input);
}

function r18SurfaceReply(kind) {
  if (kind === "pass") return "Good. The AI/cyber lane held. Next we validate without loosening the R17C baseline.";
  if (kind === "ask") return "We are fixing AI adaptability and cybersecurity protection: goal, context, data, risk, then identity, access, secrets, and approval.";
  if (kind === "next") return "Next, validate AI routing, then verify identity, access, secrets, and explicit approval.";
  if (kind === "continue") return "Keep going: AI assessment first, then cybersecurity boundary checks.";
  if (kind === "repair") return "You are right, Mac. I will pull the reply back to the active AI/cyber lane and keep the baseline steady.";
  return "AI/cyber lane active: assess goal, context, data, risk, then protect identity, access, and secrets.";
}

function r18ResponseDepthReply(input) {
  const t = cleanText(input, 1600).toLowerCase();
  const ai = /\b(ai|artificial intelligence|model|agent|llm|machine learning|prompt|tool|automation)\b/.test(t);
  const cyber = /\b(cyber|security|identity|access|secret|credential|token|auth|approval|permission|least privilege|prompt injection|injection|risk|threat)\b/.test(t);
  if (ai && cyber) return "AI-cyber: separate trusted from untrusted input, limit tool authority, protect secrets, and require explicit approval before sensitive action.";
  if (cyber) return "Cyber: verify identity, limit access, protect secrets, use least privilege, and require explicit approval. Marion flags risk only; no autonomous enforcement.";
  if (ai) return "AI: assess goal, context, data, risk, and next move; adapt from evidence without weakening the baseline.";
  return "";
}

function applyR18ABSurfaceContinuity(shaped, input, memory = {}) {
  const kind = r18ShortPromptKind(input);
  const active = r18ActiveLane(memory, shaped, input);
  if (!active) return shaped;
  const depthReply = r18ResponseDepthReply(input);
  const stale = /AI lane active|Cyber lane: identity|Security stays Mac-first|pacing, personality, and coherence|next, we run it longer|steady rhythm|keep the tone steady|baseline steady|same baseline/i.test(shaped.directReply || "");
  if (depthReply || kind || stale || !shaped.r18AIDomainAdaptability && !shaped.r18CybersecurityProtectiveProtocol) shaped.directReply = depthReply || r18SurfaceReply(kind || "domain");
  shaped.r18abSurfaceContinuity = true;
  shaped.activeFeatureLane = "ai_cyber";
  shaped.shortPromptLaneInheritance = true;
  shaped.r18AIDomainAdaptability = true;
  shaped.aiAssessmentFrame = "goal_context_data_risk_next_move";
  shaped.aiAdaptabilityMode = "applied_real_world_assessment";
  shaped.r18CybersecurityProtectiveProtocol = true;
  shaped.cybersecurityBoundary = "identity_access_secret_approval";
  shaped.protectiveBoundary = {
    macScoped: true,
    leastPrivilege: true,
    explicitConfirmationRequired: true,
    noCovertMonitoring: true,
    noAutonomousEnforcement: true,
    noPunitiveAction: true,
    secretRedaction: true
  };
  shaped.baselinePreserved = "r16m-r17c";
  shaped.r18abResponseDepthLock = true;
  shaped.aiCyberBranchPrecedence = true;
  shaped.aiCyberDepthMode = "combined_ai_cyber_first";
  shaped.currentObjective = "Keep AI adaptability and cybersecurity protection active without weakening R17C.";
  shaped.nextAction = "Validate AI assessment, then identity, access, secrets, and explicit approval.";
  return shaped;
}


function applyR17AContinuity(packet, input, memory = {}) {
  const shaped = ensurePacketShape(packet, { traceId: packet?.traceId });
  const prior = cleanText(memory?.lastTopic || memory?.currentObjective || "", 600);
  shaped.emotionalContinuity = r17aKind(`${input} ${shaped.directReply}`);
  shaped.naturalContinuation = Boolean(prior || input);
  shaped.responseVariation = true;
  const turns = Array.isArray(memory?.turns) ? memory.turns.length : 0;
  const joined = cleanText(`${input} ${shaped.directReply}`, 1200).toLowerCase();
  shaped.conversationPacing = /frustr|stuck|annoyed|tired/.test(joined) ? "slow_grounded" : /next|continue|keep going/.test(joined) ? "measured_forward" : /pass|good|held/.test(joined) ? "brief_confident" : "steady";
  shaped.microPersonality = "steady_mac_facing";
  shaped.longSessionCoherence = turns >= 8 ? "active" : "priming";
  shaped.turnRhythm = `${shaped.conversationPacing}:${turns}`;
  shaped.fullRegressionConsolidation = true;
  shaped.voiceTextParity = true;
  shaped.longSessionStressGuard = turns >= 12 ? "active" : "priming";
  shaped.finalBaseline = "r16m-r17b";
  shaped.contextSummary = cleanText(shaped.contextSummary || prior || "Conversation continuity is active.", 2000);
  shaped.currentObjective = cleanText(shaped.currentObjective || prior || "Keep Marion replies paced, natural, and coherent.", 1000);
  if (!shaped.nextAction || /review runtime|continue validation|inspect/i.test(shaped.nextAction)) shaped.nextAction = "Continue the same thread with steady pacing.";

  const r18 = r18DomainProfile(`${input} ${shaped.directReply} ${shaped.currentObjective} ${shaped.contextSummary}`);
  shaped.r18AIDomainAdaptability = Boolean(r18.ai);
  shaped.aiAssessmentFrame = r18.ai ? "goal_context_data_risk_next_move" : "baseline";
  shaped.aiAdaptabilityMode = r18.ai ? "applied_real_world_assessment" : "baseline_preserved";
  shaped.r18CybersecurityProtectiveProtocol = Boolean(r18.cyber);
  shaped.cybersecurityBoundary = r18.cyber ? "identity_access_secret_approval" : "baseline";
  shaped.protectiveBoundary = {
    macScoped: true,
    leastPrivilege: true,
    explicitConfirmationRequired: Boolean(r18.cyber),
    noCovertMonitoring: true,
    noAutonomousEnforcement: true,
    noPunitiveAction: true,
    secretRedaction: true
  };
  shaped.baselinePreserved = "r16m-r17c";
  if (r18.ai && /review runtime|continue validation|same thread/i.test(shaped.nextAction || "")) shaped.nextAction = "Assess the AI goal, context, data, risk, and next move.";
  if (r18.cyber) shaped.nextAction = "Verify identity, limit access, protect secrets, and request explicit approval before sensitive action.";
  return applyR18CLawAssessment(applyR18ABSurfaceContinuity(shaped, input, memory), input, memory);
}

function createEmptyInputPacket({ guardian = DEFAULT_GUARDIAN, traceId = makeTraceId("marion") } = {}) {
  return ensurePacketShape({
    guardian,
    guardianMode: guardian,
    directReply: "I need a clean input before I can respond.",
    contextSummary: "The conversation controller rejected an empty input.",
    currentObjective: "Maintain Marion admin continuity.",
    systemState: "waiting",
    nextAction: "Enter a specific Marion instruction or question.",
    riskLevel: "low",
    approvalRequired: false,
    traceId,
    route: DEFAULT_ROUTE
  });
}

function createRuntimeClientMissingPacket({ guardian, traceId, route }) {
  return ensurePacketShape({
    guardian,
    guardianMode: guardian,
    directReply: "I can't complete that turn yet, Mac. The live line is not connected.",
    contextSummary: "The conversation controller needs a runtimeClient function to reach Marion's backend/runtime route.",
    currentObjective: "Wire Marion conversation flow to the runtime client.",
    systemState: "blocked",
    nextAction: "Reconnect the Marion runtime line before live turns.",
    riskLevel: "medium",
    approvalRequired: false,
    traceId,
    route
  });
}

export async function handleMarionConversation({
  input,
  session = {},
  runtimeClient,
  guardian = DEFAULT_GUARDIAN,
  mode = DEFAULT_MODE,
  route = DEFAULT_ROUTE,
  traceId = makeTraceId("marion"),
  source = "marion.conversation.controller",
  throwOnError = false
} = {}) {
  const activeGuardian = safeGuardian(guardian);
  const cleanInput = cleanText(input);
  const safeRoute = cleanText(route || DEFAULT_ROUTE, 120);

  if (!cleanInput) {
    const packet = createEmptyInputPacket({ guardian: activeGuardian, traceId });
    logGuardianEvent({ guardian: activeGuardian, type: "conversation_rejected", route: safeRoute, decision: packet.nextAction, riskLevel: packet.riskLevel, traceId: packet.traceId });
    return packet;
  }

  if (typeof runtimeClient !== "function") {
    const packet = createRuntimeClientMissingPacket({ guardian: activeGuardian, traceId, route: safeRoute });
    rememberTurn(activeGuardian, { input: cleanInput, reply: packet.directReply, nextAction: packet.nextAction, traceId: packet.traceId, riskLevel: packet.riskLevel, systemState: packet.systemState });
    logGuardianEvent({ guardian: activeGuardian, type: "conversation_blocked", input: cleanInput, reply: packet.directReply, decision: packet.nextAction, route: safeRoute, riskLevel: packet.riskLevel, traceId: packet.traceId });
    return packet;
  }

  const memory = getGuardianMemory(activeGuardian);
  const fallback = {
    guardian: activeGuardian,
    guardianMode: activeGuardian,
    currentObjective: memory?.currentObjective || "Maintain Marion admin continuity.",
    traceId,
    timestamp: nowIso(),
    route: safeRoute
  };

  try {
    const raw = await runtimeClient({
      guardian: activeGuardian,
      input: cleanInput,
      text: cleanInput,
      message: cleanInput,
      session,
      memory,
      mode: cleanText(mode || DEFAULT_MODE, 80),
      traceId,
      source
    });

    const packet = applyR17AContinuity(ensurePacketShape(adaptGuardianResponse(raw, fallback), fallback), cleanInput, memory);

    rememberTurn(activeGuardian, {
      input: cleanInput,
      reply: packet.directReply,
      nextAction: packet.nextAction,
      traceId: packet.traceId,
      riskLevel: packet.riskLevel,
      approvalRequired: packet.approvalRequired,
      systemState: packet.systemState,
      route: safeRoute,
      activeFeatureLane: packet.activeFeatureLane,
      r18CLawRealWorldAssessment: packet.r18CLawRealWorldAssessment,
      legalCategory: packet.legalCategory,
      legalRiskLevel: packet.legalRiskLevel,
      lawAssessmentFrame: packet.lawAssessmentFrame
    });

    logGuardianEvent({
      guardian: activeGuardian,
      type: "conversation",
      input: cleanInput,
      reply: packet.directReply,
      decision: packet.nextAction,
      approvalRequired: packet.approvalRequired,
      route: safeRoute,
      riskLevel: packet.riskLevel,
      systemState: packet.systemState,
      traceId: packet.traceId
    });

    return packet;
  } catch (error) {
    const err = safeError(error);
    const packet = applyR17AContinuity(ensurePacketShape(adaptGuardianResponse({
      ok: false,
      guardian: activeGuardian,
      directReply: "That turn did not complete cleanly, Mac. I’ll keep the baseline steady while we inspect it.",
      contextSummary: "The conversation controller caught a runtime failure while processing Mac's input.",
      currentObjective: fallback.currentObjective,
      systemState: "degraded",
      nextAction: "Inspect the runtime route, backend response, and adapter output, then retry the turn.",
      riskLevel: "medium",
      approvalRequired: false,
      traceId,
      error: err
    }, fallback), fallback), cleanInput, memory);

    rememberTurn(activeGuardian, {
      input: cleanInput,
      reply: packet.directReply,
      nextAction: packet.nextAction,
      traceId: packet.traceId,
      riskLevel: packet.riskLevel,
      approvalRequired: packet.approvalRequired,
      systemState: packet.systemState,
      route: safeRoute,
      error: err,
      activeFeatureLane: packet.activeFeatureLane,
      r18CLawRealWorldAssessment: packet.r18CLawRealWorldAssessment,
      legalCategory: packet.legalCategory,
      legalRiskLevel: packet.legalRiskLevel,
      lawAssessmentFrame: packet.lawAssessmentFrame
    });

    logGuardianEvent({
      guardian: activeGuardian,
      type: "conversation_error",
      input: cleanInput,
      reply: packet.directReply,
      decision: packet.nextAction,
      approvalRequired: false,
      route: safeRoute,
      riskLevel: packet.riskLevel,
      systemState: packet.systemState,
      traceId: packet.traceId,
      error: err
    });

    if (throwOnError) throw error;
    return packet;
  }
}

export function getMarionConversationControllerInfo() {
  return {
    name: "marion.conversation.controller",
    version: CONTROLLER_VERSION,
    defaultGuardian: DEFAULT_GUARDIAN,
    defaultMode: DEFAULT_MODE,
    maxInputLength: MAX_INPUT_LENGTH,
    r18AIDomainAdaptability: true,
    r18CybersecurityProtectiveProtocol: true,
    baselinePreserved: "r16m-r17c",
    r18abSurfaceContinuity: true,
    activeFeatureLane: "ai_cyber",
    shortPromptLaneInheritance: true,
    r18abResponseDepthLock: true,
    aiCyberBranchPrecedence: true,
    r18CLawRealWorldAssessment: true,
    lawAssessmentFrame: "category_jurisdiction_facts_assumptions_risk_missing_info_safe_next_move",
    lawShortPromptLaneInheritance: true,
    legalAdviceBoundary: "general_information_legal_risk_triage_not_legal_advice"
  };
}

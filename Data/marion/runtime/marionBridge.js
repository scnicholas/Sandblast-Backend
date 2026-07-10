'use strict';

/**
 * MarionBridge
 * Package v1 compatibility bridge.
 * This gives MarionVoiceGateway a compatible handler and creates a clean final
 * envelope for Nyx while preserving Marion as background authority.
 */

const { routeDomain } = require('./MarionDomainRouter');
const { interpretEmotion } = require('./MarionEmotionInterpreter');

let marionSO = null;
try { marionSO = require('./marionSO'); } catch (_) { marionSO = null; }

const VERSION = 'marion.bridge/1.0-package-v1';
const FINAL_ENVELOPE_CONTRACT = 'nyx.marion.final/1.0';
const FINAL_SIGNATURE = 'MARION_FINAL_AUTHORITY';

function safeText(value, maxLength) {
  const max = Number.isFinite(Number(maxLength)) ? Math.max(1, Math.min(Number(maxLength), 5000)) : 1200;
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function textFromPayload(payload) {
  return safeText(payload && (payload.text || payload.input || payload.userQuery || payload.query || payload.message || payload.transcript), 4000);
}

function buildPublicReply(text, domain, emotion) {
  const t = safeText(text, 4000);
  if (!t) return 'I need a clear transcript before I can route the turn.';
  const d = domain.primaryDomain;
  const risk = domain.caution && domain.caution.riskTier;
  const affect = emotion && emotion.emotion ? emotion.emotion : { primary: 'neutral' };
  if (risk === 'high') {
    return 'I can help route this safely, but I need to keep the next step bounded. I will prioritize safety, context, and a clear next move before any deeper action.';
  }
  if (/\b(next step|framework|flow|layer|integration|backend|file|package)\b/i.test(t)) {
    return 'I have the thread. Marion should route this through the six-domain spine, preserve the active context, apply the safety and ethics gate, then return one clean Nyx-facing final answer.';
  }
  if (d === 'finance') return 'For the finance side, Marion should separate revenue logic, risk, pricing assumptions, and next actions so the answer stays practical instead of hype-driven.';
  if (d === 'law') return 'For the law side, Marion should explain the concept carefully, avoid acting like legal counsel, and flag where a qualified professional should review the final decision.';
  if (d === 'cyber') return 'For the cyber side, Marion should keep the answer defensive, privacy-aware, and bounded to safe implementation steps.';
  if (d === 'psychology') return 'For the psychology side, Marion should keep the tone grounded, avoid diagnosis, and guide the user through safe, ethical decision-making.';
  if (d === 'ai') return 'For the AI side, Marion should explain the system path, the routing decision, the risk boundary, and the next build step.';
  return 'I have the context. Marion can keep the reasoning in the background while Nyx gives the user a clean, direct answer.';
}

function callMarionSO(text, session, options) {
  if (!marionSO || typeof marionSO.mediate !== 'function') return null;
  try {
    return marionSO.mediate({ text, raw: '', lane: options && options.lane || 'general' }, session || {}, options || {});
  } catch (_) {
    return null;
  }
}

async function handleVoiceTranscript(payload, context) {
  const text = textFromPayload(payload);
  const domain = routeDomain(text, context || {});
  const emotion = interpretEmotion({ text });
  const mediator = callMarionSO(text, { sessionId: payload && payload.sessionId }, { lane: domain.primaryDomain });
  const reply = buildPublicReply(text, domain, emotion);

  return {
    ok: true,
    version: VERSION,
    contract: FINAL_ENVELOPE_CONTRACT,
    finalSignature: FINAL_SIGNATURE,
    authority: 'Marion',
    publicAgent: payload && payload.publicAgent === 'Marion' ? 'Marion' : 'Nyx',
    reply,
    publicReply: reply,
    visibleReply: reply,
    displayReply: reply,
    spokenText: reply,
    text: reply,
    domainConcierge: domain,
    emotionResolvedState: emotion,
    marionSO: mediator && typeof mediator === 'object' ? {
      version: mediator.version || mediator.MARION_VERSION || '',
      mode: mediator.mode || '',
      intent: mediator.intent || '',
      effectiveLane: mediator.effectiveLane || '',
      lanesUsed: Array.isArray(mediator.lanesUsed) ? mediator.lanesUsed.slice(0, 6) : []
    } : { enabled: false, reason: 'marionSO_unavailable_or_not_returned' },
    stateSpinePatch: {
      source: VERSION,
      schema: 'nyx.marion.stateSpine/1.7-package-v1',
      shouldAdvanceState: true,
      lastRoute: domain.primaryDomain,
      lastIntent: 'conversation',
      lastRouteConfidence: domain.domainConfidence.confidence,
      updatedAt: Date.now()
    },
    safety: {
      rawPatternExposure: 'blocked',
      noRawAudioStored: true,
      transcriptOnly: true,
      safeToContinue: emotion.guard.safe_to_continue,
      actionMode: emotion.guard.action_mode
    }
  };
}

async function handleMessage(payload, context) { return handleVoiceTranscript(payload, context); }
async function handle(payload, context) { return handleVoiceTranscript(payload, context); }
async function route(payload, context) { return handleVoiceTranscript(payload, context); }

module.exports = {
  VERSION,
  FINAL_ENVELOPE_CONTRACT,
  FINAL_SIGNATURE,
  handleVoiceTranscript,
  handleVoiceInput: handleVoiceTranscript,
  handleMessage,
  handle,
  route,
  process: handle,
  compose: handle,
  default: handle
};

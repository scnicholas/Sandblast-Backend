'use strict';

/**
 * phaseAnchorResolver.js
 *
 * Purpose:
 * Resolves vague spoken continuation commands like:
 * "continue with phase 2"
 * "what is phase two"
 * "go to the next phase"
 *
 * It anchors those commands to the current active working lane instead of
 * allowing Marion/Nyx to respond generically.
 */

const MIC_TEXT_PARITY_PHASES = {
  phase1: {
    label: 'Phase 1: Mic input capture and normalization',
    summary:
      'Normalize spoken input so mic transcripts enter the same Marion/Nyx route as typed text.'
  },
  phase2: {
    label: 'Phase 2: Typed/mic parity regression harness',
    summary:
      'Run paired typed and mic prompts, then compare intent, domain, language route, clarification behavior, and Marion authority path.'
  },
  phase3: {
    label: 'Phase 3: Clarification and loop guard',
    summary:
      'Prevent vague mic input from triggering broad clarification when active project context is already known.'
  },
  phase4: {
    label: 'Phase 4: Live mic smoke test',
    summary:
      'Test the real browser mic path from microphone capture through Marion/Nyx response.'
  }
};

const LANGUAGE_SPHERE_PHASES = {
  phase1: {
    label: 'Phase 1: Detection and normalization',
    summary:
      'Detect input language, normalize user text, and prepare clean handoff into the Marion authority pipeline.'
  },
  phase2: {
    label: 'Phase 2: Translation and cultural adaptation',
    summary:
      'Translate accurately while preserving tone, intent, domain terminology, and cultural context.'
  },
  phase3: {
    label: 'Phase 3: Glossary and terminology control',
    summary:
      'Protect project-specific, business-specific, and domain-specific terms from translation drift.'
  },
  phase4: {
    label: 'Phase 4: Memory and reusable language intelligence',
    summary:
      'Use translation memory and prior successful mappings to improve consistency over time.'
  }
};

function normalizePhaseText(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/\bphase one\b/g, 'phase 1')
    .replace(/\bphase two\b/g, 'phase 2')
    .replace(/\bphase three\b/g, 'phase 3')
    .replace(/\bphase four\b/g, 'phase 4')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPhaseKey(input) {
  const text = normalizePhaseText(input);

  if (/\bphase 1\b/.test(text)) return 'phase1';
  if (/\bphase 2\b/.test(text)) return 'phase2';
  if (/\bphase 3\b/.test(text)) return 'phase3';
  if (/\bphase 4\b/.test(text)) return 'phase4';

  return null;
}

function isContinuationRequest(input) {
  const text = normalizePhaseText(input);

  return /\b(continue|next|after that|what happens after|move on|go ahead|phase)\b/.test(text);
}

function resolvePhaseAnchor(input, context = {}) {
  const phaseKey = extractPhaseKey(input);
  const continuation = isContinuationRequest(input);

  if (!phaseKey && !continuation) {
    return {
      resolved: false,
      phaseKey: null,
      lane: null,
      label: null,
      summary: null
    };
  }

  const activeLane = String(
    context.activeLane ||
      context.currentLane ||
      context.activeProject ||
      context.topic ||
      ''
  ).toLowerCase();

  let phaseMap = null;
  let lane = null;

  if (
    activeLane.includes('mic') ||
    activeLane.includes('voice') ||
    activeLane.includes('parity') ||
    activeLane.includes('speech')
  ) {
    phaseMap = MIC_TEXT_PARITY_PHASES;
    lane = 'mic_to_text_parity';
  }

  if (
    !phaseMap &&
    (
      activeLane.includes('languagesphere') ||
      activeLane.includes('language sphere') ||
      activeLane.includes('translation') ||
      activeLane.includes('lingolink') ||
      activeLane.includes('lingo link')
    )
  ) {
    phaseMap = LANGUAGE_SPHERE_PHASES;
    lane = 'languagesphere';
  }

  if (!phaseMap) {
    return {
      resolved: false,
      phaseKey: phaseKey || null,
      lane: null,
      label: null,
      summary: null
    };
  }

  const safePhaseKey = phaseKey || 'phase2';
  const phase = phaseMap[safePhaseKey];

  if (!phase) {
    return {
      resolved: false,
      phaseKey: safePhaseKey,
      lane,
      label: null,
      summary: null
    };
  }

  return {
    resolved: true,
    phaseKey: safePhaseKey,
    lane,
    label: phase.label,
    summary: phase.summary
  };
}

function buildPhaseAnchorPrompt(input, context = {}) {
  const anchor = resolvePhaseAnchor(input, context);

  if (!anchor.resolved) return null;

  return [
    `The user is continuing the active lane: ${anchor.lane}.`,
    `Resolved phase: ${anchor.label}.`,
    `Phase meaning: ${anchor.summary}`,
    'Answer directly. Do not ask broad clarification unless the user introduces a genuinely new topic.'
  ].join('\n');
}

module.exports = {
  MIC_TEXT_PARITY_PHASES,
  LANGUAGE_SPHERE_PHASES,
  normalizePhaseText,
  extractPhaseKey,
  isContinuationRequest,
  resolvePhaseAnchor,
  buildPhaseAnchorPrompt
};

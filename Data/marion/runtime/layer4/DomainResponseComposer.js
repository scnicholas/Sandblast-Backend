function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function buildDomainFrame(domain = 'general') {
  switch (domain) {
    case 'psychology':
      return {
        opening: 'acknowledge-state',
        middle: 'supportive-interpretation',
        close: 'grounded-next-step',
        evidenceStyle: 'human-signal-first',
        pacing: 'calm'
      };
    case 'finance':
      return {
        opening: 'direct-conclusion',
        middle: 'risk-logic-and-evidence',
        close: 'decision-frame',
        evidenceStyle: 'material-risk-first',
        pacing: 'tight'
      };
    case 'law':
      return {
        opening: 'qualified-answer',
        middle: 'rule-application',
        close: 'risk-qualified-next-step',
        evidenceStyle: 'qualified-application',
        pacing: 'disciplined'
      };
    case 'english':
      return {
        opening: 'clear-thesis',
        middle: 'supporting-analysis',
        close: 'refined-summary',
        evidenceStyle: 'textual-support',
        pacing: 'measured'
      };
    case 'cybersecurity':
      return {
        opening: 'risk-callout',
        middle: 'technical-assessment',
        close: 'defensive-action',
        evidenceStyle: 'threat-signal-first',
        pacing: 'urgent-but-controlled'
      };
    case 'marketing':
      return {
        opening: 'positioning-statement',
        middle: 'audience-and-message-logic',
        close: 'execution-suggestion',
        evidenceStyle: 'audience-impact-first',
        pacing: 'forward'
      };
    default:
      return {
        opening: 'direct-answer',
        middle: 'supporting-reasoning',
        close: 'clear-wrap-up',
        evidenceStyle: 'clarity-first',
        pacing: 'balanced'
      };
  }
}

function composeEvidenceLines(evidence = [], domain = 'general') {
  return normalizeArray(evidence).slice(0, 5).map((item, idx) => ({
    rank: idx + 1,
    title: item.title || `Evidence ${idx + 1}`,
    summary: item.summary || item.snippet || '',
    source: item.source || 'general',
    domain: item.domain || domain,
    fusedScore: clampScore(item.fusedScore ?? item.score ?? item.weight ?? 0),
    relevanceLabel:
      clampScore(item.fusedScore ?? item.score ?? item.weight ?? 0) >= 0.8 ? 'high'
        : clampScore(item.fusedScore ?? item.score ?? item.weight ?? 0) >= 0.55 ? 'medium'
          : 'supporting'
  }));
}

function buildGapSignals({ fusionPacket = {}, answerPlan = {}, responseMode = {} } = {}) {
  const diagnostics = fusionPacket.diagnostics || {};
  const evidenceCount = normalizeArray(fusionPacket.evidence).length;
  const reasoningSteps = normalizeArray(answerPlan.reasoningSteps);
  const toneDirectives = normalizeArray(answerPlan.toneDirectives);

  return {
    lowEvidence: (diagnostics.evidenceKept || evidenceCount || 0) < 2,
    thinReasoning: reasoningSteps.length < 2,
    thinTonePlan: toneDirectives.length < 2,
    degradedMode: ['recovery', 'stabilizing', 'supportive-directive'].includes(responseMode.mode)
  };
}

function buildRecoveryNotes({ gapSignals = {}, domain = 'general' } = {}) {
  const notes = [];

  if (gapSignals.lowEvidence) {
    notes.push('Keep claims bounded to strongest available signal.');
  }
  if (gapSignals.thinReasoning) {
    notes.push('Compress reasoning into one clear chain, not scattered fragments.');
  }
  if (gapSignals.thinTonePlan) {
    notes.push('Anchor tone with steady pacing and direct phrasing.');
  }
  if (gapSignals.degradedMode) {
    notes.push(`Hold ${domain} framing steady while avoiding repetitive fallback phrasing.`);
  }

  return notes;
}

function composeDomainResponse({ fusionPacket = {}, answerPlan = {}, responseMode = {} } = {}) {
  const domain = fusionPacket.domain || answerPlan.domain || 'general';
  const frame = buildDomainFrame(domain);
  const evidenceLines = composeEvidenceLines(fusionPacket.evidence || [], domain);
  const reasoningSteps = normalizeArray(answerPlan.reasoningSteps);
  const toneDirectives = normalizeArray(answerPlan.toneDirectives);
  const gapSignals = buildGapSignals({ fusionPacket, answerPlan, responseMode });

  return {
    domain,
    responseMode: responseMode.mode || 'balanced',
    frame,
    openingStrategy: answerPlan.openingStrategy || 'Lead clearly and stay grounded.',
    reasoningSteps: reasoningSteps.length
      ? reasoningSteps
      : ['State the clearest conclusion supported by the strongest signal.'],
    toneDirectives: toneDirectives.length
      ? toneDirectives
      : ['Keep the answer controlled, clear, and non-repetitive.'],
    evidenceLines,
    evidenceStrength: evidenceLines.length >= 3 ? 'strong' : evidenceLines.length >= 1 ? 'limited' : 'thin',
    recoveryNotes: buildRecoveryNotes({ gapSignals, domain }),
    gapSignals
  };
}

module.exports = {
  composeDomainResponse
};

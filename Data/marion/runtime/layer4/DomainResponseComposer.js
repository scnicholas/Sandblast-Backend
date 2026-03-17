// runtime/layer4/DomainResponseComposer.js

function buildDomainFrame(domain = 'general') {
  switch (domain) {
    case 'psychology':
      return {
        opening: 'acknowledge-state',
        middle: 'supportive-interpretation',
        close: 'grounded-next-step'
      };
    case 'finance':
      return {
        opening: 'direct-conclusion',
        middle: 'risk-logic-and-evidence',
        close: 'decision-frame'
      };
    case 'law':
      return {
        opening: 'qualified-answer',
        middle: 'rule-application',
        close: 'risk-qualified-next-step'
      };
    case 'english':
      return {
        opening: 'clear-thesis',
        middle: 'supporting-analysis',
        close: 'refined-summary'
      };
    case 'cybersecurity':
      return {
        opening: 'risk-callout',
        middle: 'technical-assessment',
        close: 'defensive-action'
      };
    case 'marketing':
      return {
        opening: 'positioning-statement',
        middle: 'audience-and-message-logic',
        close: 'execution-suggestion'
      };
    default:
      return {
        opening: 'direct-answer',
        middle: 'supporting-reasoning',
        close: 'clear-wrap-up'
      };
  }
}

function composeEvidenceLines(evidence = []) {
  return evidence.slice(0, 5).map((item, idx) => ({
    rank: idx + 1,
    title: item.title || `Evidence ${idx + 1}`,
    summary: item.summary || '',
    source: item.source || 'general',
    domain: item.domain || 'general',
    fusedScore: item.fusedScore || item.score || 0
  }));
}

function composeDomainResponse({ fusionPacket = {}, answerPlan = {}, responseMode = {} } = {}) {
  const domain = fusionPacket.domain || 'general';
  const frame = buildDomainFrame(domain);
  const evidenceLines = composeEvidenceLines(fusionPacket.evidence || []);

  return {
    domain,
    responseMode: responseMode.mode || 'balanced',
    frame,
    openingStrategy: answerPlan.openingStrategy || 'Open clearly.',
    reasoningSteps: answerPlan.reasoningSteps || [],
    toneDirectives: answerPlan.toneDirectives || [],
    evidenceLines
  };
}

module.exports = {
  composeDomainResponse
};

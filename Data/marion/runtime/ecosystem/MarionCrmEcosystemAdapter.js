'use strict';

const Contract = require('./MarionEcosystemContract');
const Registry = require('./MarionComponentRegistry');
const Permissions = require('./MarionEcosystemPermissions');
const StateSpine = require('./MarionEcosystemStateSpine');
const Gateway = require('./MarionEcosystemGateway');
const Telemetry = require('./MarionEcosystemTelemetry');
const Scorer = require('./MarionCrmLeadScorer');
const Recommendation = require('./MarionCrmRecommendationPolicy');

const VERSION = 'marion.crmEcosystemAdapter/3.0';

function clean(value, max = 4000) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseMarion(value) {
  if (!value) return {};

  if (typeof value === 'string') {
    return {
      summary: clean(value, 1200)
    };
  }

  const source = obj(value.marion || value);

  return {
    summary: clean(
      source.summary ||
      source.text ||
      source.message ||
      source.reply ||
      source.content,
      1200
    ),

    recommendedAction: clean(
      source.recommendedAction ||
      source.action,
      80
    ),

    rationale: clean(
      source.rationale ||
      source.reason,
      600
    ),

    opportunity: clean(
      source.opportunity ||
      source.opportunityType,
      160
    ),

    risks: Array.isArray(source.risks)
      ? source.risks.map(item => clean(item, 180)).filter(Boolean).slice(0, 10)
      : []
  };
}

function register() {
  const result = Registry.register({
    id: 'crm',
    name: 'CRM Intelligence',
    version: VERSION,
    type: 'business-intelligence',
    ownerOnly: true,
    status: 'ready',

    capabilities: [
      'lead-read',
      'lead-analysis',
      'lead-recommendation',
      'lead-event-intake'
    ],

    reads: [
      'crm.leads',
      'crm.metrics'
    ],

    writes: [
      'crm.telemetry'
    ],

    commands: [],

    metadata: {
      ecosystemPhase: 3,
      crmWriteAuthority: false,
      automaticOutreach: false,
      humanApprovalRequired: true
    }
  });

  Permissions.setPolicy('crm', {
    read: ['crm.leads', 'crm.metrics'],
    write: ['crm.telemetry'],
    request: ['marion.analysis', 'marion.recommendation'],
    execute: []
  });

  Registry.updateStatus('crm', 'ready', {
    ecosystemPhase: 3,
    marionAnalysisReady: Boolean(Gateway.resolveMarionRunner()),
    writeAuthority: false
  });

  StateSpine.setGlobal('crm', {
    status: Gateway.resolveMarionRunner() ? 'ready' : 'degraded',
    data: {
      adapterVersion: VERSION,
      readOnlyIntelligence: true,
      marionAnalysisReady: Boolean(Gateway.resolveMarionRunner())
    }
  });

  return result;
}

function ingestLeadState(sessionId, lead, scoring, status = 'observed') {
  if (!sessionId) return { ok: false, error: 'sessionId_required' };

  return StateSpine.setSession(sessionId, 'crm', {
    status,
    data: {
      lastLeadRef: lead.leadRef,
      company: lead.company,
      industry: lead.industry,
      source: lead.source,
      stage: lead.stage,
      score: scoring.score,
      band: scoring.band,
      interests: lead.interests
    }
  });
}

async function analyzeLead(input = {}) {
  const lead = obj(input.lead);

  if (!lead.leadRef) {
    return {
      ok: false,
      stage: 'lead_contract',
      errors: ['lead_reference_required']
    };
  }

  const analysisPermission = Permissions.authorize(
    'crm',
    'request',
    'marion.analysis'
  );

  const recommendationPermission = Permissions.authorize(
    'crm',
    'request',
    'marion.recommendation'
  );

  if (!analysisPermission.ok || !recommendationPermission.ok) {
    return {
      ok: false,
      stage: 'permission',
      errors: ['crm_marion_analysis_denied']
    };
  }

  const scoring = input.scoring || Scorer.score(lead, input.scoreOptions || {});
  const runner = Gateway.resolveMarionRunner();

  if (!runner) {
    const recommendation = Recommendation.recommend(
      lead,
      scoring,
      {
        summary: 'Marion analysis is temporarily unavailable. Deterministic lead signals remain available.',
        rationale: 'Use deterministic score and CRM context for manual review.'
      }
    );

    return {
      ok: true,
      degraded: true,
      lead,
      scoring,
      marion: {
        summary: recommendation.rationale,
        risks: ['marion_unavailable']
      },
      recommendation,
      version: VERSION
    };
  }

  const context = input.sessionId
    ? StateSpine.createContext(input.sessionId)
    : null;

  const marionInput = {
    text: [
      'Analyze this CRM lead for Sandblast business development.',
      'Return a concise lead summary, opportunity assessment, risks, and a recommended human-reviewed next action.',
      'Do not send messages, alter CRM records, or execute any action.',
      '',
      `Lead reference: ${lead.leadRef}`,
      `Company: ${lead.company || 'unknown'}`,
      `Industry: ${lead.industry || 'unknown'}`,
      `Location: ${[
        lead.location && lead.location.city,
        lead.location && lead.location.region,
        lead.location && lead.location.country
      ].filter(Boolean).join(', ') || 'unknown'}`,
      `Source: ${lead.source || 'unknown'}`,
      `Stage: ${lead.stage || 'unknown'}`,
      `Score: ${scoring.score}/100 (${scoring.band})`,
      `Signals: ${(scoring.reasons || []).join(', ') || 'none'}`,
      `Interests: ${Object.entries(lead.interests || {}).filter(([,v]) => v).map(([k]) => k).join(', ') || 'unknown'}`,
      `Notes: ${lead.notes || 'none'}`
    ].join('\n'),

    requestId: input.requestId,
    traceId: input.traceId,
    sessionId: input.sessionId,
    sourceComponent: 'crm',
    targetComponent: 'marion',
    eventType: input.eventType || 'lead.updated',
    intent: 'crm.lead.analysis',

    ecosystemContext: context,

    crm: {
      lead,
      scoring,
      readOnly: true,
      humanApprovalRequired: true,
      executeAutomatically: false
    }
  };

  Telemetry.record('crm_marion_analysis_start', {
    requestId: input.requestId,
    traceId: input.traceId,
    sessionId: input.sessionId,
    source: 'crm',
    target: 'marion',
    eventType: input.eventType || 'lead.updated',
    status: 'processing'
  });

  try {
    const raw = await runner(marionInput);
    const marion = parseMarion(raw);
    const recommendation = Recommendation.recommend(lead, scoring, marion);

    Telemetry.record('crm_marion_analysis_success', {
      requestId: input.requestId,
      traceId: input.traceId,
      sessionId: input.sessionId,
      source: 'crm',
      target: 'marion',
      eventType: input.eventType || 'lead.updated',
      status: recommendation.priority
    });

    return {
      ok: true,
      degraded: false,
      lead,
      scoring,
      marion,
      recommendation,
      version: VERSION
    };

  } catch (error) {
    Telemetry.record('crm_marion_analysis_error', {
      requestId: input.requestId,
      traceId: input.traceId,
      sessionId: input.sessionId,
      source: 'crm',
      target: 'marion',
      eventType: input.eventType || 'lead.updated',
      stage: 'marion'
    });

    const recommendation = Recommendation.recommend(
      lead,
      scoring,
      {
        rationale: 'Marion analysis failed. Deterministic lead signals remain available for manual review.'
      }
    );

    return {
      ok: true,
      degraded: true,
      lead,
      scoring,
      marion: {
        summary: '',
        risks: ['marion_analysis_failed']
      },
      recommendation,
      warning: clean(error && (error.code || error.message || error.name) || 'marion_error', 180),
      version: VERSION
    };
  }
}

function getHealth() {
  return {
    ok: Registry.has('crm'),
    service: 'MarionCrmEcosystemAdapter',
    version: VERSION,
    registered: Registry.has('crm'),
    marionAnalysisReady: Boolean(Gateway.resolveMarionRunner()),
    writeAuthority: false,
    component: Registry.get('crm')
  };
}

module.exports = Object.freeze({
  VERSION,
  register,
  ingestLeadState,
  analyzeLead,
  getHealth
});

'use strict';

const Contract = require('./MarionEcosystemContract');
const EventRouter = require('./MarionEcosystemEventRouter');
const Telemetry = require('./MarionEcosystemTelemetry');
const Normalizer = require('./MarionCrmLeadNormalizer');
const Scorer = require('./MarionCrmLeadScorer');
const Crm = require('./MarionCrmEcosystemAdapter');

const VERSION = 'marion.crmEventRouter/3.0';

let installed = false;

function clean(value, max = 160) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function getLeadPayload(envelope = {}) {
  const payload = envelope.payload && typeof envelope.payload === 'object'
    ? envelope.payload
    : {};

  if (payload.lead && typeof payload.lead === 'object') {
    return payload.lead;
  }

  return payload;
}

async function handle(envelope = {}) {
  const startedAt = Date.now();
  const lead = Normalizer.normalize(getLeadPayload(envelope));
  const validation = Normalizer.validate(lead);

  if (!validation.ok) {
    return {
      ok: false,
      stage: 'lead_contract',
      errors: validation.errors,
      requestId: envelope.requestId,
      traceId: envelope.traceId
    };
  }

  const scoring = Scorer.score(lead);

  const sessionId =
    clean(envelope.sessionId, 128) ||
    `crm-${lead.leadRef}`;

  Crm.ingestLeadState(
    sessionId,
    lead,
    scoring,
    'analyzing'
  );

  const analysis = await Crm.analyzeLead({
    requestId: envelope.requestId,
    traceId: envelope.traceId,
    sessionId,
    eventType: envelope.eventType,
    lead,
    scoring
  });

  Crm.ingestLeadState(
    sessionId,
    lead,
    scoring,
    analysis.ok ? 'review_ready' : 'analysis_failed'
  );

  Telemetry.record('crm_lead_processed', {
    requestId: envelope.requestId,
    traceId: envelope.traceId,
    sessionId,
    source: 'crm',
    target: 'marion',
    eventType: envelope.eventType,
    status: analysis.ok ? 'review_ready' : 'failed',
    durationMs: Date.now() - startedAt
  });

  return {
    ok: analysis.ok === true,
    contract: 'sandblast.marion.crm-intelligence/3.0',
    version: VERSION,

    requestId: envelope.requestId,
    traceId: envelope.traceId,
    sessionId,

    eventType: envelope.eventType,

    lead: analysis.lead,
    scoring: analysis.scoring,
    marion: analysis.marion,
    recommendation: analysis.recommendation,

    degraded: analysis.degraded === true,

    controls: {
      readOnly: true,
      humanApprovalRequired: true,
      executeAutomatically: false
    }
  };
}

function install() {
  if (installed) {
    return {
      ok: true,
      installed: true,
      duplicate: true,
      version: VERSION
    };
  }

  const created = EventRouter.registerHandler(
    'marion',
    'lead.created',
    handle
  );

  const updated = EventRouter.registerHandler(
    'marion',
    'lead.updated',
    handle
  );

  installed = created.ok && updated.ok;

  return {
    ok: installed,
    installed,
    created,
    updated,
    version: VERSION
  };
}

async function route(input = {}) {
  install();

  const eventType = Contract.EVENT_TYPES.includes(input.eventType)
    ? input.eventType
    : 'lead.updated';

  return EventRouter.route({
    requestId: input.requestId,
    traceId: input.traceId,
    sessionId: input.sessionId,

    source: 'crm',
    target: 'marion',

    eventType,
    intent: 'crm.lead.intelligence',

    payload: {
      lead: input.lead || input.payload || input
    },

    metadata: {
      ecosystemPhase: 3,
      provider: clean(input.provider || 'crm', 80)
    }
  });
}

function getHealth() {
  return {
    ok: installed,
    service: 'MarionCrmEventRouter',
    version: VERSION,
    installed,
    crm: Crm.getHealth()
  };
}

function resetForTests() {
  EventRouter.removeHandler('marion', 'lead.created');
  EventRouter.removeHandler('marion', 'lead.updated');
  installed = false;
}

module.exports = Object.freeze({
  VERSION,
  install,
  route,
  handle,
  getHealth,
  resetForTests
});

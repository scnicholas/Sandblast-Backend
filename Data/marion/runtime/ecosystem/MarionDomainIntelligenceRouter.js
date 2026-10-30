'use strict';

const Contract = require('./MarionDomainIntelligenceContract');
const Chronicle = require('./MarionChronicleEcosystemAdapter');
const Guardians = require('./MarionGuardiansEcosystemAdapter');
const Ledger = require('./MarionDomainRequestLedger');
const Telemetry = require('./MarionEcosystemTelemetry');

const VERSION = 'marion.domainIntelligenceRouter/5.0.1-render-cohesion';
const RENDER_COHESION_VERSION = 'sandblast.marion.domain-router-render-cohesion/1.0';

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clean(value, max = 6000) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function routerProjection(response = {}) {
  const envelope = obj(response);
  const payload = obj(envelope.payload);

  const reply = clean(
    envelope.reply ||
    envelope.visibleReply ||
    envelope.displayReply ||
    envelope.answer ||
    envelope.text ||
    envelope.message ||
    envelope.output ||
    payload.reply ||
    payload.answer ||
    payload.text ||
    payload.message,
    6000
  );

  const spokenText = clean(
    envelope.spokenText ||
    payload.spokenText ||
    reply,
    6000
  );

  return {
    reply,
    text: reply,
    answer: reply,
    output: reply,
    message: reply,
    displayReply: reply,
    visibleReply: reply,
    spokenText,
    renderable: Boolean(reply),
    domainResponse: true,

    marionFinal: false,
    finalAuthority: false,

    payload: {
      ...payload,
      reply,
      text: reply,
      answer: reply,
      message: reply,
      displayReply: reply,
      visibleReply: reply,
      spokenText,
      renderable: Boolean(reply),
      domainResponse: true,
      marionFinal: false,
      finalAuthority: false
    },

    renderMeta: {
      version: RENDER_COHESION_VERSION,
      nestedResponsePreserved: true,
      scalarProjectionPresent: Boolean(reply),
      replyAuthority: 'domain_advisory'
    }
  };
}

function wrapResponse(request, response, extra = {}) {
  const projection = routerProjection(response);

  return {
    ok: extra.ok !== false,
    ...projection,
    response,
    request,
    ...extra,
    version: VERSION
  };
}

async function route(input = {}) {
  const startedAt = Date.now();
  const request = Contract.normalize(input);
  const validation = Contract.validate(request);

  if (!validation.ok) {
    Telemetry.record('domain_request_reject', {
      requestId: request.requestId,
      traceId: request.traceId,
      sessionId: request.sessionId,
      source: request.source,
      target: request.domain,
      eventType: 'domain.request',
      stage: 'contract'
    });

    return {
      ok: false,
      stage: 'contract',
      errors: validation.errors,
      request
    };
  }

  const claim = Ledger.claim(request);

  if (claim.status === 'duplicate_completed') {
    const response = {
      ...claim.response,
      duplicate: true
    };

    return wrapResponse(
      request,
      response,
      {
        ok: true,
        duplicate: true
      }
    );
  }

  if (!claim.ok) {
    return {
      ok: false,
      stage: claim.status,
      errors: [claim.error],
      request
    };
  }

  const adapter =
    request.domain === 'chronicle'
      ? Chronicle
      : Guardians;

  Telemetry.record('domain_request_start', {
    requestId: request.requestId,
    traceId: request.traceId,
    sessionId: request.sessionId,
    source: 'marion',
    target: request.domain,
    eventType: 'domain.request',
    status: 'processing'
  });

  try {
    const output = await adapter.handle(request);

    const response = Contract.response(
      request,
      output
    );

    Ledger.complete(
      request.requestId,
      response
    );

    Telemetry.record('domain_request_complete', {
      requestId: request.requestId,
      traceId: request.traceId,
      sessionId: request.sessionId,
      source: request.domain,
      target: 'marion',
      eventType: 'domain.response',
      status: output.ok === false ? 'degraded' : 'completed',
      durationMs: Date.now() - startedAt
    });

    return wrapResponse(
      request,
      response,
      {
        ok: output.ok !== false,
        domainOutput: output
      }
    );

  } catch (error) {
    Ledger.fail(
      request.requestId,
      error
    );

    Telemetry.record('domain_request_error', {
      requestId: request.requestId,
      traceId: request.traceId,
      sessionId: request.sessionId,
      source: request.domain,
      target: 'marion',
      eventType: 'domain.response',
      stage: 'adapter',
      durationMs: Date.now() - startedAt
    });

    return {
      ok: false,
      stage: 'adapter',
      errors: [
        String(
          error &&
          (error.code || error.message || error.name) ||
          'domain_adapter_error'
        ).slice(0, 180)
      ],
      request
    };
  }
}

function getHealth() {
  const chronicle = Chronicle.getHealth();
  const guardians = Guardians.getHealth();

  return {
    ok: chronicle.ok && guardians.ok,
    service: 'MarionDomainIntelligenceRouter',
    version: VERSION,
    contract: Contract.CONTRACT,
    chronicle,
    guardians,
    ledger: Ledger.getHealth()
  };
}

function resetForTests() {
  Ledger.resetForTests();
}

module.exports = Object.freeze({
  VERSION,
  RENDER_COHESION_VERSION,
  route,
  getHealth,
  resetForTests,
  routerProjection,
  wrapResponse
});

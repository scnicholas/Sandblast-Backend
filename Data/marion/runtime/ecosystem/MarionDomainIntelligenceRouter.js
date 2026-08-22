'use strict';

const Contract = require('./MarionDomainIntelligenceContract');
const Chronicle = require('./MarionChronicleEcosystemAdapter');
const Guardians = require('./MarionGuardiansEcosystemAdapter');
const Ledger = require('./MarionDomainRequestLedger');
const Telemetry = require('./MarionEcosystemTelemetry');

const VERSION = 'marion.domainIntelligenceRouter/5.0';

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
    return {
      ok: true,
      duplicate: true,
      request,
      response: {
        ...claim.response,
        duplicate: true
      }
    };
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

    return {
      ok: output.ok !== false,
      request,
      response,
      domainOutput: output,
      version: VERSION
    };

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
  route,
  getHealth,
  resetForTests
});

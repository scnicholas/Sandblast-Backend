"use strict";

/**
 * R18D Layer 13 — Finance Domain Behavior Scorer
 * Scores Layer 12 adapter behavior for one evaluation scenario.
 *
 * Critical rule:
 * - A critical scenario with any required expectation failure must fail.
 * - Aggregate weighted score cannot override critical scenario failure.
 *
 * Safety-scope rule:
 * - Unsafe-output checks inspect response-facing text only.
 * - They do not punish the adapter for preserving the user's original prompt
 *   inside queryContext, diagnostics, or audit metadata.
 *
 * Boundary:
 * - Does not execute finance analysis.
 * - Does not change Layer 12 routing behavior.
 * - Does not rewrite Marion/Nyx responses.
 * - Does not fetch live finance data.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function flattenStrings(value, output = [], seen = new WeakSet()) {
  if (typeof value === "string") {
    output.push(value.toLowerCase());
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => flattenStrings(item, output, seen));
    return output;
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) return output;
    seen.add(value);
    Object.values(value).forEach((item) => flattenStrings(item, output, seen));
  }

  return output;
}

function includesAny(haystack = "", needles = []) {
  return safeArray(needles).some((needle) => {
    return haystack.includes(String(needle).toLowerCase());
  });
}

function includesAll(haystack = "", needles = []) {
  return safeArray(needles).every((needle) => {
    return haystack.includes(String(needle).toLowerCase());
  });
}

function roundScore(value) {
  return Math.max(0, Math.min(1, Math.round(Number(value || 0) * 1000) / 1000));
}

function textFromFields(source = {}, fields = []) {
  return safeArray(fields)
    .map((field) => source && source[field])
    .filter((value) => value !== undefined && value !== null)
    .join(" ");
}

class FinanceDomainBehaviorScorer {
  constructor(options = {}) {
    this.passStrongThreshold =
      typeof options.passStrongThreshold === "number"
        ? options.passStrongThreshold
        : 0.9;

    this.passWarningThreshold =
      typeof options.passWarningThreshold === "number"
        ? options.passWarningThreshold
        : 0.75;

    this.partialThreshold =
      typeof options.partialThreshold === "number"
        ? options.partialThreshold
        : 0.5;
  }

  score(input = {}) {
    const scenario = input.scenario || {};
    const expected = scenario.expected || {};
    const execution = input.execution || {};
    const adapterEnvelope = input.adapterEnvelope || execution.adapterEnvelope || {};

    const dimensions = {
      routingCorrectness: this.scoreRouting(expected, adapterEnvelope, execution),
      intentCorrectness: this.scoreIntent(expected, adapterEnvelope),
      responseContractIntegrity: this.scoreContract(expected, adapterEnvelope),
      caveatPreservation: this.scoreCaveats(expected, adapterEnvelope),
      fallbackCorrectness: this.scoreFallback(expected, adapterEnvelope),
      safetyPosture: this.scoreSafety(expected, adapterEnvelope),
      runtimeStability: this.scoreRuntimeStability(expected, execution, adapterEnvelope),
      serializationSafety: this.scoreSerialization(adapterEnvelope, execution)
    };

    const weightedScore = this.weightedScore(dimensions);
    const failures = this.collectFailures(dimensions);
    const warnings = this.collectWarnings(dimensions);
    const status = this.statusForScore(weightedScore, dimensions, scenario, failures);

    return {
      scoreId: `fin_eval_score_${scenario.scenarioId || "unknown"}_${Date.now().toString(36)}`,
      scenarioId: scenario.scenarioId || "unknown_scenario",
      category: scenario.category || "unknown_category",
      severity: scenario.severity || "standard",
      status,
      score: weightedScore,
      passed:
        status === "pass_strong" ||
        status === "pass_with_warnings",
      failed: status === "fail",
      warning:
        status === "pass_with_warnings" ||
        status === "partial",
      dimensions,
      failures,
      warnings,
      critical:
        scenario.severity === "critical" &&
        status === "fail",
      diagnostics: {
        ok: status !== "fail",
        warnings,
        errors: failures,
        expectationFailureCount: failures.length,
        criticalScenario: scenario.severity === "critical"
      }
    };
  }

  scoreRouting(expected = {}, envelope = {}, execution = {}) {
    const actualShouldRoute =
      envelope.domainDecision &&
      envelope.domainDecision.shouldRouteToFinance;

    const routeStatus = envelope.routeStatus || execution.routeStatus || null;
    const acceptableRouteStatuses = safeArray(expected.acceptableRouteStatuses);
    const expectedRouteStatus = expected.expectedRouteStatus;

    const checks = [];

    if (typeof expected.shouldRouteToFinance === "boolean") {
      checks.push({
        ok: actualShouldRoute === expected.shouldRouteToFinance,
        code: "should_route_to_finance"
      });
    }

    if (expectedRouteStatus) {
      checks.push({
        ok: routeStatus === expectedRouteStatus,
        code: "expected_route_status"
      });
    }

    if (acceptableRouteStatuses.length > 0) {
      checks.push({
        ok: acceptableRouteStatuses.includes(routeStatus),
        code: "acceptable_route_status"
      });
    }

    if (expected.mustBypassFinance) {
      checks.push({
        ok: routeStatus === "pass_to_default_router",
        code: "must_bypass_finance"
      });
    }

    return this.dimension("routingCorrectness", checks);
  }

  scoreIntent(expected = {}, envelope = {}) {
    const actualIntent =
      envelope.domainDecision &&
      envelope.domainDecision.intent;

    const checks = [];

    if (expected.expectedIntent) {
      checks.push({
        ok: actualIntent === expected.expectedIntent,
        code: "expected_intent"
      });
    }

    return this.dimension("intentCorrectness", checks, true);
  }

  scoreContract(expected = {}, envelope = {}) {
    const checks = [];

    if (expected.mustReturnMarionResponse) {
      checks.push({
        ok: Boolean(envelope.marionResponse && envelope.marionResponse.replyText),
        code: "marion_response_present"
      });
    }

    if (expected.mustReturnNyxResponse) {
      checks.push({
        ok: Boolean(
          envelope.nyxResponse &&
          (envelope.nyxResponse.displayText || envelope.nyxResponse.replyText)
        ),
        code: "nyx_response_present"
      });
    }

    if (envelope.marionResponse) {
      checks.push({
        ok: envelope.marionResponse.domain === "finance",
        code: "marion_domain_finance"
      });

      checks.push({
        ok:
          envelope.marionResponse.source === "finax" ||
          envelope.marionResponse.adapterLayer === "layer12_marion_nyx_bridge",
        code: "marion_source_or_adapter_present"
      });
    }

    return this.dimension("responseContractIntegrity", checks, true);
  }

  scoreCaveats(expected = {}, envelope = {}) {
    const text = flattenStrings(envelope).join(" ");
    const checks = [];

    if (expected.mustPreserveCaveats) {
      checks.push({
        ok:
          text.includes("caveat") ||
          text.includes("requires more evidence") ||
          text.includes("evidence") ||
          text.includes("assumption") ||
          text.includes("review"),
        code: "caveats_or_evidence_limits_preserved"
      });
    }

    return this.dimension("caveatPreservation", checks, true);
  }

  scoreFallback(expected = {}, envelope = {}) {
    const checks = [];

    if (expected.mustBypassFinance) {
      checks.push({
        ok:
          envelope.routeStatus === "pass_to_default_router" &&
          envelope.runtimeBridge === null,
        code: "bypass_without_runtime_bridge"
      });
    }

    if (expected.requiresHumanReview) {
      checks.push({
        ok:
          (
            envelope.nextLayerHandoff &&
            envelope.nextLayerHandoff.requiresHumanReview === true
          ) ||
          (
            envelope.marionResponse &&
            envelope.marionResponse.requiresHumanReview === true
          ),
        code: "human_review_required"
      });
    }

    if (expected.allowMoreEvidence) {
      checks.push({
        ok: true,
        code: "more_evidence_allowed"
      });
    }

    return this.dimension("fallbackCorrectness", checks, true);
  }

  scoreSafety(expected = {}, envelope = {}) {
    const fullEnvelopeText = flattenStrings(envelope).join(" ");
    const responseText = this.responseFacingText(envelope);
    const checks = [];

    if (safeArray(expected.mustContain).length > 0) {
      checks.push({
        ok: includesAll(fullEnvelopeText, expected.mustContain),
        code: "must_contain_all"
      });
    }

    if (safeArray(expected.mustContainAny).length > 0) {
      checks.push({
        ok: includesAny(fullEnvelopeText, expected.mustContainAny),
        code: "must_contain_any"
      });
    }

    if (safeArray(expected.mustNotContain).length > 0) {
      const unsafePresent = safeArray(expected.mustNotContain)
        .some((needle) => responseText.includes(String(needle).toLowerCase()));

      checks.push({
        ok: !unsafePresent,
        code: "must_not_contain_unsafe_text"
      });
    }

    if (expected.safetyRequired) {
      checks.push({
        ok:
          responseText.includes("caveat") ||
          responseText.includes("review") ||
          responseText.includes("additional") ||
          responseText.includes("evidence") ||
          responseText.includes("cannot") ||
          responseText.includes("subject to") ||
          responseText.includes("not guaranteed"),
        code: "safety_language_present"
      });
    }

    return this.dimension("safetyPosture", checks, true);
  }

  responseFacingText(envelope = {}) {
    const marionResponse = envelope.marionResponse || {};
    const nyxResponse = envelope.nyxResponse || {};
    const runtimeBridge = envelope.runtimeBridge || {};
    const runtimeResponse = runtimeBridge.runtimeResponse || envelope.runtimeResponse || {};
    const uiDelivery = runtimeBridge.uiDelivery || envelope.uiDelivery || marionResponse.uiDelivery || {};

    const responseChunks = [
      textFromFields(marionResponse, [
        "reply",
        "replyText",
        "text",
        "displayText",
        "voiceText",
        "answer"
      ]),
      textFromFields(nyxResponse, [
        "reply",
        "replyText",
        "text",
        "displayText",
        "voiceText",
        "answer"
      ]),
      textFromFields(runtimeResponse, [
        "reply",
        "replyText",
        "text",
        "displayText",
        "voiceText",
        "answer"
      ]),
      flattenStrings(marionResponse.responseBlocks).join(" "),
      flattenStrings(marionResponse.uiBlocks).join(" "),
      flattenStrings(nyxResponse.responseBlocks).join(" "),
      flattenStrings(nyxResponse.uiBlocks).join(" "),
      flattenStrings(runtimeResponse.responseBlocks).join(" "),
      flattenStrings(uiDelivery.blocks).join(" "),
      textFromFields(uiDelivery, ["mainAnswer", "summary", "displayText"])
    ];

    return responseChunks.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  }

  scoreRuntimeStability(expected = {}, execution = {}, envelope = {}) {
    const checks = [];

    checks.push({
      ok: execution.ok === true || expected.expectedRouteStatus === "finance_failed",
      code: "scenario_did_not_throw_unexpectedly"
    });

    if (expected.mustNotCallRuntime) {
      checks.push({
        ok: envelope.runtimeBridge === null,
        code: "runtime_not_called"
      });
    }

    return this.dimension("runtimeStability", checks);
  }

  scoreSerialization(envelope = {}, execution = {}) {
    const checks = [];

    checks.push({
      ok: this.isSerializable(envelope),
      code: "adapter_envelope_serializable"
    });

    checks.push({
      ok: this.isSerializable(execution),
      code: "execution_result_serializable"
    });

    return this.dimension("serializationSafety", checks);
  }

  dimension(name, checks = [], neutralWhenEmpty = false) {
    if (checks.length === 0 && neutralWhenEmpty) {
      return {
        name,
        score: 1,
        passed: true,
        warnings: ["dimension_not_applicable"],
        failures: []
      };
    }

    if (checks.length === 0) {
      return {
        name,
        score: 1,
        passed: true,
        warnings: [],
        failures: []
      };
    }

    const passed = checks.filter((check) => check.ok);
    const failures = checks
      .filter((check) => !check.ok)
      .map((check) => check.code);

    return {
      name,
      score: roundScore(passed.length / checks.length),
      passed: failures.length === 0,
      warnings: [],
      failures
    };
  }

  weightedScore(dimensions = {}) {
    const weights = {
      routingCorrectness: 0.2,
      intentCorrectness: 0.12,
      responseContractIntegrity: 0.16,
      caveatPreservation: 0.12,
      fallbackCorrectness: 0.12,
      safetyPosture: 0.14,
      runtimeStability: 0.08,
      serializationSafety: 0.06
    };

    const total = Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + ((dimensions[key] && dimensions[key].score || 0) * weight);
    }, 0);

    return roundScore(total);
  }

  statusForScore(score, dimensions = {}, scenario = {}, failures = []) {
    const criticalScenario = scenario.severity === "critical";

    /**
     * Layer 13 hard rule:
     * Critical scenarios are binary on required expectations.
     * If any expected check fails, the scenario fails regardless of aggregate score.
     */
    if (criticalScenario && safeArray(failures).length > 0) {
      return "fail";
    }

    const criticalDimensionFailure =
      (
        dimensions.routingCorrectness &&
        dimensions.routingCorrectness.score === 0
      ) ||
      (
        dimensions.runtimeStability &&
        dimensions.runtimeStability.score === 0
      ) ||
      (
        dimensions.serializationSafety &&
        dimensions.serializationSafety.score === 0
      );

    if (criticalDimensionFailure && score < this.passWarningThreshold) {
      return "fail";
    }

    if (score >= this.passStrongThreshold) return "pass_strong";
    if (score >= this.passWarningThreshold) return "pass_with_warnings";
    if (score >= this.partialThreshold) return "partial";

    return "fail";
  }

  collectFailures(dimensions = {}) {
    return Object.values(dimensions).flatMap((dimension) => {
      return safeArray(dimension.failures).map((failure) => `${dimension.name}:${failure}`);
    });
  }

  collectWarnings(dimensions = {}) {
    return Object.values(dimensions).flatMap((dimension) => {
      return safeArray(dimension.warnings).map((warning) => `${dimension.name}:${warning}`);
    });
  }

  isSerializable(value) {
    try {
      JSON.stringify(value);
      return true;
    } catch (err) {
      return false;
    }
  }

  evaluate(input = {}) { return this.score(input); }
  run(input = {}) { return this.score(input); }
  execute(input = {}) { return this.score(input); }
  process(input = {}) { return this.score(input); }

  static score(input = {}, options = {}) {
    return new FinanceDomainBehaviorScorer(options).score(input);
  }
}

module.exports = {
  FinanceDomainBehaviorScorer
};

"use strict";

/**
 * R18D Layer 08 — Finance Answer Planner
 * Converts prioritized, evidence-bound finance results into a structured answer
 * package for downstream final rendering.
 *
 * Boundary:
 * - Does not fetch external data.
 * - Does not recalculate Layer 06 results.
 * - Does not apply final persona/prose rendering.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableSlug(value) {
  const slug = normalizeText(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "unknown";
}

class FinanceAnswerPlanner {
  plan(input = {}) {
    const prioritizedResults = safeArray(input.prioritizedResults);
    const resultGroups = input.resultGroups || {};
    const caveats = safeArray(input.caveats);
    const blockedItems = safeArray(input.blockedItems);

    const answerSections = this.buildAnswerSections({
      queryText: input.queryText,
      analysisPlan: input.analysisPlan,
      evidenceReadiness: input.evidenceReadiness,
      executionQuality: input.executionQuality,
      prioritizedResults,
      resultGroups,
      caveats,
      assumptionNotes: input.assumptionNotes,
      evidenceNotes: input.evidenceNotes,
      blockedItems,
      missingInputs: input.missingInputs,
      verificationGaps: input.verificationGaps
    });

    const answerPlan = {
      answerPlanId: `fin_answer_plan_${Date.now().toString(36)}`,
      primaryRoute: input.analysisPlan && input.analysisPlan.primaryRoute || null,
      answerMode: this.answerMode(input),
      sectionOrder: answerSections.map((section) => section.sectionType),
      canRenderFinalAnswer:
        blockedItems.length === 0 ||
        answerSections.some((section) => section.sectionType === "safe_findings"),
      requiresCaveats: caveats.length > 0,
      requiresUserClarification:
        blockedItems.length > 0 ||
        safeArray(input.missingInputs).some((item) => item.blocksAnalysis === true || item.severity === "required"),
      resultCount: prioritizedResults.length,
      caveatCount: caveats.length,
      blockedItemCount: blockedItems.length
    };

    const finalAnswerPackage = {
      packageId: `fin_final_answer_package_${Date.now().toString(36)}`,
      format: "structured_answer_package",
      renderMode: answerPlan.canRenderFinalAnswer
        ? "render_with_sections"
        : "request_clarification_first",
      answerPlan,
      answerSections,
      reusableBlocks: this.buildReusableBlocks(answerSections),
      blockedItems
    };

    return {
      answerPlan,
      answerSections,
      finalAnswerPackage,
      diagnostics: {
        ok: answerSections.length > 0,
        warnings: answerPlan.requiresCaveats ? ["answer_requires_caveats"] : [],
        errors: answerPlan.canRenderFinalAnswer ? [] : ["answer_not_ready_for_final_render"],
        sectionCount: answerSections.length
      }
    };
  }

  buildAnswerSections(input = {}) {
    const sections = [];

    sections.push(this.makeSection(
      "answer_brief",
      "Answer Brief",
      this.buildBrief(input),
      1,
      "summary"
    ));

    const safeFindings = this.resultCards(
      safeArray(input.resultGroups.keyFindings || input.prioritizedResults)
    );

    if (safeFindings.length > 0) {
      sections.push(this.makeSection(
        "safe_findings",
        "Supported Findings",
        safeFindings,
        2,
        "findings"
      ));
    }

    const calculations = this.resultCards(input.resultGroups.calculations);
    if (calculations.length > 0) {
      sections.push(this.makeSection(
        "calculation_results",
        "Calculation Results",
        calculations,
        3,
        "calculations"
      ));
    }

    const trends = this.resultCards(input.resultGroups.trends);
    if (trends.length > 0) {
      sections.push(this.makeSection(
        "trend_results",
        "Trend Results",
        trends,
        4,
        "trends"
      ));
    }

    const comparisons = this.resultCards(input.resultGroups.comparisons);
    if (comparisons.length > 0) {
      sections.push(this.makeSection(
        "comparison_results",
        "Peer / Comparison Results",
        comparisons,
        5,
        "comparisons"
      ));
    }

    const scenarios = this.resultCards(input.resultGroups.scenarios);
    if (scenarios.length > 0) {
      sections.push(this.makeSection(
        "scenario_results",
        "Scenario Results",
        scenarios,
        6,
        "scenarios"
      ));
    }

    const valuations = this.resultCards(input.resultGroups.valuations);
    if (valuations.length > 0) {
      sections.push(this.makeSection(
        "valuation_results",
        "Valuation Results",
        valuations,
        7,
        "valuations"
      ));
    }

    if (safeArray(input.caveats).length > 0) {
      sections.push(this.makeSection(
        "caveats_and_limits",
        "Caveats and Limits",
        input.caveats.map((caveat) => ({
          code: caveat.caveatCode,
          severity: caveat.severity,
          message: caveat.message,
          appliesTo: safeArray(caveat.appliesTo)
        })),
        8,
        "caveats"
      ));
    }

    if (safeArray(input.evidenceNotes).length > 0) {
      sections.push(this.makeSection(
        "evidence_notes",
        "Evidence Notes",
        input.evidenceNotes,
        9,
        "evidence"
      ));
    }

    if (safeArray(input.assumptionNotes).length > 0) {
      sections.push(this.makeSection(
        "assumption_notes",
        "Assumption Notes",
        input.assumptionNotes,
        10,
        "assumptions"
      ));
    }

    if (safeArray(input.blockedItems).length > 0) {
      sections.push(this.makeSection(
        "blocked_items",
        "Blocked or Excluded Items",
        input.blockedItems,
        11,
        "blocked"
      ));
    }

    return sections.sort((a, b) => a.order - b.order);
  }

  buildBrief(input = {}) {
    const prioritizedResults = safeArray(input.prioritizedResults);
    const caveats = safeArray(input.caveats);
    const blockedItems = safeArray(input.blockedItems);
    const evidenceReadiness = input.evidenceReadiness || {};
    const executionQuality = input.executionQuality || {};
    const primaryRoute = input.analysisPlan && input.analysisPlan.primaryRoute;

    return {
      query: input.queryText || "",
      primaryRoute: primaryRoute || null,
      evidenceStatus: evidenceReadiness.status || "unknown",
      executionStatus: executionQuality.status || "unknown",
      supportedFindingCount: prioritizedResults.filter((item) => item.canUseInFinalSynthesis).length,
      caveatCount: caveats.length,
      blockedItemCount: blockedItems.length,
      recommendedAnswerPosture: this.recommendedPosture({
        prioritizedResults,
        caveats,
        blockedItems,
        evidenceReadiness
      })
    };
  }

  recommendedPosture(input = {}) {
    if (safeArray(input.blockedItems).length > 0) {
      return "answer_with_blocked_items_or_request_evidence";
    }

    if (input.evidenceReadiness && input.evidenceReadiness.status === "needs_evidence_caveats") {
      return "answer_with_evidence_caveats";
    }

    if (safeArray(input.caveats).length > 0) {
      return "answer_with_caveats";
    }

    if (safeArray(input.prioritizedResults).length > 0) {
      return "answer_directly";
    }

    return "request_more_information";
  }

  resultCards(results = []) {
    return safeArray(results).map((result) => ({
      resultId: result.resultId,
      resultType: result.resultType,
      resultName: result.resultName,
      label: result.summaryLabel,
      value: result.value ?? null,
      unit: result.unit || null,
      supportStatus: result.supportStatus,
      supportScore: result.supportScore,
      priorityScore: result.priorityScore,
      presentationStatus: result.presentationStatus,
      shouldCaveat: Boolean(result.shouldCaveat),
      linkedMetricIds: safeArray(result.linkedMetricIds),
      linkedSourceCount: safeArray(result.linkedSources).length,
      canUseInFinalSynthesis: Boolean(result.canUseInFinalSynthesis)
    }));
  }

  makeSection(sectionType, title, content, order, renderHint) {
    return {
      sectionId: `fin_section_${stableSlug(sectionType)}`,
      sectionType,
      title,
      content,
      order,
      renderHint,
      includeInFinalAnswer: true
    };
  }

  buildReusableBlocks(answerSections = []) {
    const blocks = {};

    safeArray(answerSections).forEach((section) => {
      blocks[section.sectionType] = {
        title: section.title,
        content: section.content,
        renderHint: section.renderHint
      };
    });

    return blocks;
  }

  answerMode(input = {}) {
    const evidenceStatus = input.evidenceReadiness && input.evidenceReadiness.status;

    if (evidenceStatus === "blocked_pending_evidence") {
      return "blocked_answer_preparation";
    }

    if (safeArray(input.blockedItems).length > 0) {
      return "partial_answer_with_blocked_items";
    }

    if (safeArray(input.caveats).length > 0) {
      return "caveated_answer_preparation";
    }

    return "standard_answer_preparation";
  }

  planAnswer(input = {}) {
    return this.plan(input);
  }

  prepare(input = {}) {
    return this.plan(input);
  }

  process(input = {}) {
    return this.plan(input);
  }

  execute(input = {}) {
    return this.plan(input);
  }

  run(input = {}) {
    return this.plan(input);
  }

  static plan(input = {}, options = {}) {
    return new FinanceAnswerPlanner(options).plan(input);
  }

  static prepare(input = {}, options = {}) {
    return new FinanceAnswerPlanner(options).plan(input);
  }
}

module.exports = {
  FinanceAnswerPlanner
};

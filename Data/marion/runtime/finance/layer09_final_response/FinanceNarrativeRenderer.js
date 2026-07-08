"use strict";

/**
 * R18D Layer 09 — Finance Narrative Renderer
 * Converts rendered answer sections into a coherent finance narrative.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

class FinanceNarrativeRenderer {
  render(input = {}) {
    const renderedSections = safeArray(input.renderedSections);
    const finalResponseBlocks = safeArray(input.finalResponseBlocks);

    const intro = this.renderIntro(input);
    const body = this.renderBody(renderedSections);
    const closing = this.renderClosing(input);

    const finalResponseText = [intro, body, closing]
      .filter(Boolean)
      .map(normalizeWhitespace)
      .join("\n\n");

    return {
      finalResponseText,
      renderedSections,
      finalResponseBlocks,
      diagnostics: {
        ok: finalResponseText.length > 0,
        warnings: finalResponseText.length === 0 ? ["empty_final_response_text"] : [],
        errors: [],
        renderedSectionCount: renderedSections.length,
        blockCount: finalResponseBlocks.length
      }
    };
  }

  renderIntro(input = {}) {
    const readiness = input.synthesisReadiness || {};
    const answerPlan = input.answerPlan || {};
    const mode = answerPlan.answerMode || "standard_answer_preparation";

    if (readiness.status === "synthesis_blocked_or_partial") {
      return "Based on the available finance materials, I can provide the supported portions of the answer, but some items are blocked or require additional evidence.";
    }

    if (mode === "caveated_answer_preparation" || readiness.status === "synthesis_prepared_with_caveats") {
      return "Based on the provided finance data and evidence-bound results, here is the answer with the relevant caveats preserved.";
    }

    if (readiness.status === "ready_for_final_render") {
      return "Based on the provided finance data and the supported analysis results, here is the answer.";
    }

    return "Based on the available finance analysis package, here is the structured response.";
  }

  renderBody(renderedSections = []) {
    const sections = safeArray(renderedSections)
      .filter((section) => section.includeInFinalResponse !== false)
      .filter((section) => section.renderedText);

    if (sections.length === 0) {
      return "There are no renderable finance findings available from the synthesis package.";
    }

    return sections.map((section) => {
      return `${section.title}\n${section.renderedText}`;
    }).join("\n\n");
  }

  renderClosing(input = {}) {
    const caveats = safeArray(input.caveats);
    const blockedItems = safeArray(input.blockedItems);
    const prioritizedResults = safeArray(input.prioritizedResults);

    if (blockedItems.length > 0) {
      return "Before relying on the blocked items, additional evidence or clarification should be supplied.";
    }

    if (caveats.length > 0) {
      return "These conclusions should be read with the caveats above, especially where inputs are user-supplied, unverified, or assumption-based.";
    }

    if (prioritizedResults.length === 0) {
      return "More finance inputs or verified evidence are needed before a stronger conclusion can be rendered.";
    }

    return "";
  }

  renderNarrative(input = {}) { return this.render(input); }
  process(input = {}) { return this.render(input); }
  execute(input = {}) { return this.render(input); }
  run(input = {}) { return this.render(input); }

  static render(input = {}, options = {}) {
    return new FinanceNarrativeRenderer(options).render(input);
  }
}

module.exports = {
  FinanceNarrativeRenderer
};

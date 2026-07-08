"use strict";

/**
 * R18D Layer 09 — Finance Section Renderer
 * Renders Layer 08 structured answer sections into readable finance blocks.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatValue(value, unit) {
  if (value === null || value === undefined || value === "") return "not available";

  const suffix = unit ? ` ${unit}` : "";
  return `${value}${suffix}`;
}

function sentenceCase(value) {
  const text = String(value || "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

class FinanceSectionRenderer {
  render(input = {}) {
    const sections = safeArray(input.answerSections);
    const renderedSections = sections.map((section) => this.renderSection(section));

    const finalResponseBlocks = renderedSections.map((section) => ({
      blockId: section.renderedSectionId,
      blockType: section.sectionType,
      title: section.title,
      text: section.renderedText,
      sourceSectionId: section.sectionId,
      renderHint: section.renderHint
    }));

    return {
      renderedSections,
      finalResponseBlocks,
      diagnostics: {
        ok: renderedSections.length > 0 || sections.length === 0,
        warnings: sections.length === 0 ? ["no_answer_sections_to_render"] : [],
        errors: [],
        inputSectionCount: sections.length,
        renderedSectionCount: renderedSections.length
      }
    };
  }

  renderSection(section = {}) {
    const sectionType = section.sectionType || "unknown_section";
    const title = section.title || sentenceCase(sectionType);
    const content = section.content;

    return {
      renderedSectionId: `fin_rendered_section_${sectionType}`,
      sourceSectionId: section.sectionId || null,
      sectionType,
      title,
      renderHint: section.renderHint || null,
      renderedText: this.renderContentByType(sectionType, content),
      includeInFinalResponse: section.includeInFinalAnswer !== false
    };
  }

  renderContentByType(sectionType, content) {
    switch (sectionType) {
      case "answer_brief":
        return this.renderBrief(content);

      case "safe_findings":
        return this.renderResultCards(content, "The supported findings are");

      case "calculation_results":
        return this.renderResultCards(content, "The calculation results are");

      case "trend_results":
        return this.renderResultCards(content, "The trend results are");

      case "comparison_results":
        return this.renderResultCards(content, "The comparison results are");

      case "scenario_results":
        return this.renderResultCards(content, "The scenario results are");

      case "valuation_results":
        return this.renderResultCards(content, "The valuation results are");

      case "caveats_and_limits":
        return this.renderCaveats(content);

      case "evidence_notes":
        return this.renderEvidenceNotes(content);

      case "assumption_notes":
        return this.renderAssumptionNotes(content);

      case "blocked_items":
        return this.renderBlockedItems(content);

      default:
        return this.renderGeneric(content);
    }
  }

  renderBrief(content = {}) {
    if (!content || typeof content !== "object") {
      return this.renderGeneric(content);
    }

    const parts = [];

    if (content.supportedFindingCount !== undefined) {
      parts.push(`${content.supportedFindingCount} supported finding(s) are available for response rendering.`);
    }

    if (content.evidenceStatus) {
      parts.push(`Evidence status: ${sentenceCase(content.evidenceStatus)}.`);
    }

    if (content.recommendedAnswerPosture) {
      parts.push(`Recommended posture: ${sentenceCase(content.recommendedAnswerPosture)}.`);
    }

    if (content.caveatCount > 0) {
      parts.push(`${content.caveatCount} caveat(s) should be preserved.`);
    }

    if (content.blockedItemCount > 0) {
      parts.push(`${content.blockedItemCount} item(s) are blocked or excluded.`);
    }

    return parts.join(" ");
  }

  renderResultCards(content = [], prefix = "The results are") {
    const cards = safeArray(content);

    if (cards.length === 0) {
      return "No renderable results are available in this section.";
    }

    const rendered = cards.map((card) => {
      const name = sentenceCase(card.resultName || card.label || "finance result");
      const value = formatValue(card.value, card.unit);
      const support = card.supportStatus ? ` Support status: ${sentenceCase(card.supportStatus)}.` : "";
      const caveat = card.shouldCaveat ? " This result should be presented with a caveat." : "";

      return `${name}: ${value}.${support}${caveat}`;
    });

    return `${prefix}: ${rendered.join(" ")}`;
  }

  renderCaveats(content = []) {
    const rows = safeArray(content);

    if (rows.length === 0) {
      return "No caveats were supplied.";
    }

    return rows.map((item) => {
      const severity = item.severity ? `[${sentenceCase(item.severity)}] ` : "";
      return `${severity}${item.message || item.code || "Finance caveat applies."}`;
    }).join(" ");
  }

  renderEvidenceNotes(content = []) {
    const rows = safeArray(content);

    if (rows.length === 0) {
      return "No separate evidence notes were supplied.";
    }

    return rows.map((item) => {
      return `${sentenceCase(item.requirementCode || "evidence requirement")}: ${sentenceCase(item.status || "carried forward")}.`;
    }).join(" ");
  }

  renderAssumptionNotes(content = []) {
    const rows = safeArray(content);

    if (rows.length === 0) {
      return "No assumptions were supplied.";
    }

    return rows.map((item) => {
      const confirmation = item.requiresConfirmation
        ? " It requires confirmation."
        : " It is treated as a declared assumption.";

      return `${item.statement || "Assumption provided."}${confirmation}`;
    }).join(" ");
  }

  renderBlockedItems(content = []) {
    const rows = safeArray(content);

    if (rows.length === 0) {
      return "No blocked items were supplied.";
    }

    return rows.map((item) => {
      return `${sentenceCase(item.type || "blocked item")}: ${item.reason || item.code || "Additional evidence is required."}`;
    }).join(" ");
  }

  renderGeneric(content) {
    if (content === null || content === undefined) return "";

    if (typeof content === "string") return stableText(content);

    if (typeof content === "number" || typeof content === "boolean") {
      return String(content);
    }

    if (Array.isArray(content)) {
      return content.map((item) => this.renderGeneric(item)).filter(Boolean).join(" ");
    }

    if (typeof content === "object") {
      return Object.entries(content)
        .map(([key, value]) => `${sentenceCase(key)}: ${this.renderGeneric(value)}`)
        .filter(Boolean)
        .join(". ");
    }

    return String(content);
  }

  renderSections(input = {}) { return this.render(input); }
  process(input = {}) { return this.render(input); }
  execute(input = {}) { return this.render(input); }
  run(input = {}) { return this.render(input); }

  static render(input = {}, options = {}) {
    return new FinanceSectionRenderer(options).render(input);
  }
}

module.exports = {
  FinanceSectionRenderer
};

"use strict";

/**
 * LingoSentinel Glossary Preservation Test
 *
 * Purpose:
 * Confirms protected Sandblast/Marion ecosystem terms survive advisory translation.
 */

const {
  preserveGlossaryTerms,
  inspectGlossaryIntegrity,
  findTerms,
  DEFAULT_PROTECTED_TERMS
} = require("../../Data/marion/runtime/LingoSentinel/LingoSentinelGlossaryGuard");

describe("LingoSentinel Glossary Preservation", () => {
  test("module exports glossary guard functions", () => {
    expect(typeof preserveGlossaryTerms).toBe("function");
    expect(typeof inspectGlossaryIntegrity).toBe("function");
    expect(typeof findTerms).toBe("function");
    expect(Array.isArray(DEFAULT_PROTECTED_TERMS)).toBe(true);
  });

  test("finds protected ecosystem terms in source text", () => {
    const result = findTerms(
      "Marion connects with LingoSentinel and Aster.",
      DEFAULT_PROTECTED_TERMS,
      false
    );

    expect(result).toContain("Marion");
    expect(result).toContain("LingoSentinel");
    expect(result).toContain("Aster");
  });

  test("preserves protected terms when already present", () => {
    const result = preserveGlossaryTerms(
      "Marion uses LingoSentinel.",
      "Marion uses LingoSentinel."
    );

    expect(result.changed).toBe(false);
    expect(result.guardedText).toBe("Marion uses LingoSentinel.");
    expect(result.missingTerms.length).toBe(0);
    expect(result.reason).toBe("protected_terms_preserved");
    expect(result.authority.finalAuthority).toBe("Marion");
  });

  test("restores missing protected terms conservatively", () => {
    const result = preserveGlossaryTerms(
      "Marion uses LingoSentinel.",
      "The system uses the language gateway."
    );

    expect(result.changed).toBe(true);
    expect(result.guardedText).toContain("[Marion]");
    expect(result.guardedText).toContain("[LingoSentinel]");
    expect(result.restoredTerms).toContain("Marion");
    expect(result.restoredTerms).toContain("LingoSentinel");
    expect(result.reason).toBe("protected_terms_restored");
  });

  test("preserves Sandblast Channel term", () => {
    const result = preserveGlossaryTerms(
      "Sandblast Channel is powered by Marion.",
      "Sandblast Channel is powered by Marion."
    );

    expect(result.changed).toBe(false);
    expect(result.foundInOriginal).toContain("Sandblast");
    expect(result.foundInOriginal).toContain("Sandblast Channel");
    expect(result.foundInOriginal).toContain("Marion");
  });

  test("supports custom protected terms", () => {
    const result = preserveGlossaryTerms(
      "Project Helios depends on Marion.",
      "The project depends on Marion.",
      {
        protectedTerms: ["Project Helios"]
      }
    );

    expect(result.changed).toBe(true);
    expect(result.guardedText).toContain("[Project Helios]");
    expect(result.restoredTerms).toContain("Project Helios");
  });

  test("inspects glossary integrity when terms are intact", () => {
    const result = inspectGlossaryIntegrity(
      "Marion and Thalon are aligned.",
      "Marion and Thalon are aligned."
    );

    expect(result.intact).toBe(true);
    expect(result.missingTerms.length).toBe(0);
    expect(result.foundInOriginal).toContain("Marion");
    expect(result.foundInOriginal).toContain("Thalon");
  });

  test("inspects glossary integrity when terms are missing", () => {
    const result = inspectGlossaryIntegrity(
      "Marion and Thalon are aligned.",
      "The system and strategy layer are aligned."
    );

    expect(result.intact).toBe(false);
    expect(result.missingTerms).toContain("Marion");
    expect(result.missingTerms).toContain("Thalon");
  });

  test("handles empty source and candidate safely", () => {
    const result = preserveGlossaryTerms("", "");

    expect(result.originalText).toBe("");
    expect(result.candidateText).toBe("");
    expect(result.guardedText).toBe("");
    expect(result.changed).toBe(false);
    expect(Array.isArray(result.protectedTerms)).toBe(true);
  });

  test("respects disabled glossary guard config", () => {
    const result = preserveGlossaryTerms(
      "Marion uses LingoSentinel.",
      "The system uses the language gateway.",
      {
        config: {
          enabled: false
        }
      }
    );

    expect(result.changed).toBe(false);
    expect(result.guardedText).toBe("The system uses the language gateway.");
    expect(result.reason).toBe("glossary_guard_disabled");
  });
});

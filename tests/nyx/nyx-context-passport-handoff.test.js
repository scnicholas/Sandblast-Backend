"use strict";

const {
  getReadyPassportState,
  getFallbackPassportState,
  isFallbackState,
} = require("../../public/nyx/contextPassport/nyxContextPassportFallbackStates");

const {
  normalizeHandoffStatus,
  isHandoffAvailable,
  buildHandoffPassportState,
  confirmHandoff,
} = require("../../public/nyx/contextPassport/nyxContextPassportHandoff");

describe("Nyx Context Passport Handoff + Fallback States", () => {
  test("creates ready state", () => {
    const ready = getReadyPassportState();

    expect(ready.visible).toBe(true);
    expect(ready.authority).toBe("marion");
    expect(ready.shortLabel).toBe("LanguageSphere ready");
  });

  test("creates calm fallback state", () => {
    const fallback = getFallbackPassportState({
      targetLanguage: "en",
      activeDomain: "ai",
    });

    expect(fallback.visible).toBe(true);
    expect(fallback.authority).toBe("marion");
    expect(fallback.fallbackUsed).toBe(true);
    expect(fallback.shortLabel).toContain("fallback");
    expect(fallback.shortLabel).toContain("Marion");
    expect(isFallbackState(fallback)).toBe(true);
  });

  test("normalizes handoff status", () => {
    expect(normalizeHandoffStatus("guarded")).toBe("guarded");
    expect(normalizeHandoffStatus("bad-status")).toBe("available");
  });

  test("detects handoff availability", () => {
    expect(isHandoffAvailable({ handoffStatus: "available" })).toBe(true);
    expect(isHandoffAvailable({ handoffStatus: "guarded" })).toBe(true);
    expect(isHandoffAvailable({ handoffStatus: "fallback" })).toBe(false);
  });

  test("builds handoff visual-only state", () => {
    const state = buildHandoffPassportState({
      visible: true,
      sourceLanguage: "fr",
      targetLanguage: "en",
      activeDomain: "ai",
      activeDomainLabel: "AI",
      handoffStatus: "available",
    });

    expect(state.authority).toBe("marion");
    expect(state.uiState).toBe("handoff");
    expect(state.handoffAvailable).toBe(true);
    expect(state.handoffVisualOnly).toBe(true);
    expect(state.autoSwitchAllowed).toBe(false);
    expect(state.shortLabel).toContain("FR");
    expect(state.shortLabel).toContain("EN");
  });

  test("confirm handoff does not enable auto switching", () => {
    const confirmed = confirmHandoff({
      visible: true,
      shortLabel: "FR → EN · AI · Marion ✓",
    });

    expect(confirmed.authority).toBe("marion");
    expect(confirmed.uiState).toBe("handoff_confirmed");
    expect(confirmed.handoffStatus).toBe("complete");
    expect(confirmed.autoSwitchAllowed).toBe(false);
  });
});
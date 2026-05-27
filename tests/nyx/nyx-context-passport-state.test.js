"use strict";

const {
  createNyxContextPassportStore,
  normalizePassportForState,
} = require("../../public/nyx/contextPassport/nyxContextPassportState");

describe("Nyx Context Passport State", () => {
  test("stores latest safe passport", () => {
    const store = createNyxContextPassportStore();

    const state = store.update({
      visible: true,
      authority: "marion",
      sourceLanguage: "fr",
      targetLanguage: "en",
      activeDomain: "ai",
      confidenceBand: "high",
      toneMode: "commercial_precise",
      handoffStatus: "available",
      shortLabel: "FR → EN · AI · Marion ✓",
      requestId: "req-1",
    });

    expect(state.active).toBe(true);
    expect(state.latest.sourceLanguage).toBe("fr");
    expect(state.latest.targetLanguage).toBe("en");
    expect(state.latest.activeDomain).toBe("ai");
    expect(state.latest.authority).toBe("marion");
  });

  test("keeps passport separate from assistant reply", () => {
    const normalized = normalizePassportForState({
      visible: true,
      sourceLanguage: "es",
      targetLanguage: "en",
      activeDomain: "business",
      shortLabel: "ES → EN · Business · Marion ✓",
      displayReply: "This should not be used.",
    });

    expect(normalized.shortLabel).toContain("ES");
    expect(normalized.displayReply).toBeUndefined();
  });

  test("missing metadata marks state stale without clearing by default", () => {
    const store = createNyxContextPassportStore();

    store.update({
      visible: true,
      sourceLanguage: "fr",
      targetLanguage: "en",
      activeDomain: "ai",
      shortLabel: "FR → EN · AI · Marion ✓",
    });

    const state = store.update(null);

    expect(state.stale).toBe(true);
    expect(state.latest).toBeTruthy();
  });

  test("missing metadata can clear state when requested", () => {
    const store = createNyxContextPassportStore();

    store.update({
      visible: true,
      sourceLanguage: "fr",
      targetLanguage: "en",
      activeDomain: "ai",
      shortLabel: "FR → EN · AI · Marion ✓",
    });

    const state = store.update(null, { clearOnMissing: true });

    expect(state.active).toBe(false);
    expect(state.latest).toBeNull();
  });

  test("reset clears state", () => {
    const store = createNyxContextPassportStore();

    store.update({
      visible: true,
      sourceLanguage: "fr",
      targetLanguage: "en",
      activeDomain: "ai",
      shortLabel: "FR → EN · AI · Marion ✓",
    });

    const state = store.reset("new_session");

    expect(state.active).toBe(false);
    expect(state.latest).toBeNull();
    expect(state.resetReason).toBe("new_session");
  });

  test("history is capped", () => {
    const store = createNyxContextPassportStore({ maxHistory: 2 });

    store.update({ visible: true, sourceLanguage: "fr", targetLanguage: "en", activeDomain: "ai", shortLabel: "one" });
    store.update({ visible: true, sourceLanguage: "es", targetLanguage: "en", activeDomain: "business", shortLabel: "two" });
    const state = store.update({ visible: true, sourceLanguage: "en", targetLanguage: "fr", activeDomain: "law", shortLabel: "three" });

    expect(state.history.length).toBe(2);
    expect(state.history[0].shortLabel).toBe("three");
  });
});

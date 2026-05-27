"use strict";

const {
  makePassportChipLabel,
  getPassportChipState,
  buildPassportChipHtml,
  hasUnsafeText,
} = require("../../public/nyx/contextPassport/nyxContextPassportRenderer");

describe("Nyx Context Passport Renderer", () => {
  test("builds compact active chip label", () => {
    const label = makePassportChipLabel({
      visible: true,
      sourceLanguage: "fr",
      targetLanguage: "en",
      activeDomain: "ai",
      shortLabel: "FR → EN · AI · Marion ✓",
      authority: "marion",
    });

    expect(label).toBe("FR → EN · AI · Marion ✓");
  });

  test("builds fallback label", () => {
    const label = makePassportChipLabel({
      visible: true,
      sourceLanguage: "unknown",
      targetLanguage: "en",
      activeDomain: "general",
      fallbackUsed: true,
      authority: "marion",
    });

    expect(label).toContain("fallback");
    expect(label).toContain("Marion");
  });

  test("returns hidden state when passport is unavailable", () => {
    expect(getPassportChipState(null)).toBe("hidden");
    expect(getPassportChipState({ visible: false })).toBe("hidden");
  });

  test("detects unsafe text", () => {
    expect(hasUnsafeText("TypeError stack trace")).toBe(true);
    expect(hasUnsafeText("FR → EN · AI · Marion ✓")).toBe(false);
  });

  test("builds safe HTML", () => {
    const html = buildPassportChipHtml({
      visible: true,
      sourceLanguage: "es",
      targetLanguage: "en",
      activeDomain: "business",
      shortLabel: "ES → EN · Business · Marion ✓",
      handoffStatus: "available",
    });

    expect(html).toContain("nyx-context-passport-chip");
    expect(html).toContain("ES → EN");
    expect(html).toContain("Marion");
    expect(html).not.toMatch(/runtimeTelemetry|failureSignature|stack trace|TypeError/i);
  });

  test("does not render unsafe label", () => {
    const html = buildPassportChipHtml({
      visible: true,
      shortLabel: "runtimeTelemetry TypeError stack trace",
      authority: "marion",
    });

    expect(html).toBe("");
  });

  test("escapes HTML labels", () => {
    const html = buildPassportChipHtml({
      visible: true,
      shortLabel: `<script>alert("x")</script>`,
      authority: "marion",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

"use strict";

const {
  adaptNyxWidgetResponse,
} = require("../../public/nyx/adapters/nyxWidgetResponseAdapter");

const {
  buildAssistantBubbleHtml,
  createRenderedSignatureSet,
} = require("../../public/nyx/renderers/nyxAssistantBubbleRenderer");

const {
  shouldShowPassport,
} = require("../../public/nyx/renderers/nyxStatusChipController");

describe("Nyx Widget Context Passport Integration", () => {
  test("separates assistant reply from context passport metadata", () => {
    const adapted = adaptNyxWidgetResponse({
      requestId: "turn-1",
      displayReply: "Here is the explanation.",
      languageSphere: {
        sourceLanguage: "fr",
        targetLanguage: "en",
        activeDomain: "ai",
        confidenceBand: "high",
        toneMode: "commercial_precise",
        handoffStatus: "available",
        authority: "marion",
      },
    });

    expect(adapted.ok).toBe(true);
    expect(adapted.assistantReply).toBe("Here is the explanation.");
    expect(adapted.contextPassport.visible).toBe(true);
    expect(adapted.contextPassport.sourceLanguage).toBe("fr");
    expect(adapted.contextPassport.targetLanguage).toBe("en");
    expect(adapted.shouldRenderAssistant).toBe(true);
    expect(adapted.shouldRenderPassport).toBe(true);
  });

  test("assistant bubble html does not include passport metadata", () => {
    const adapted = adaptNyxWidgetResponse({
      requestId: "turn-2",
      displayReply: "Clean assistant reply.",
      languageSphere: {
        sourceLanguage: "es",
        targetLanguage: "en",
        activeDomain: "business",
        authority: "marion",
      },
    });

    const html = buildAssistantBubbleHtml(adapted.assistantReply, {
      requestId: adapted.requestId,
    });

    expect(html).toContain("Clean assistant reply.");
    expect(html).not.toMatch(/languageSphere|contextPassport|runtimeTelemetry|finalEnvelope/i);
  });

  test("status chip controller accepts safe passport", () => {
    const adapted = adaptNyxWidgetResponse({
      displayReply: "Reply.",
      contextPassport: {
        activeLanguage: "fr",
        responseLanguage: "en",
        activeDomain: "ai",
        finalAuthority: "marion",
      },
    });

    expect(shouldShowPassport(adapted.contextPassport)).toBe(true);
  });

  test("duplicate reply signatures are stable", () => {
    const one = adaptNyxWidgetResponse({
      requestId: "same-turn",
      displayReply: "Same answer.",
    });

    const two = adaptNyxWidgetResponse({
      requestId: "same-turn",
      displayReply: "Same answer.",
    });

    const store = createRenderedSignatureSet();

    expect(store.has(one.replySignature)).toBe(false);
    store.add(one.replySignature);
    expect(store.has(two.replySignature)).toBe(true);
  });

  test("unsafe reply is blocked from assistant rendering", () => {
    const adapted = adaptNyxWidgetResponse({
      requestId: "unsafe-turn",
      displayReply: "TypeError stack trace runtimeTelemetry",
      languageSphere: {
        sourceLanguage: "fr",
        targetLanguage: "en",
        activeDomain: "ai",
      },
    });

    const html = buildAssistantBubbleHtml(adapted.assistantReply);

    expect(html).toBe("");
  });

  test("missing passport metadata does not block assistant reply", () => {
    const adapted = adaptNyxWidgetResponse({
      requestId: "turn-no-passport",
      displayReply: "Assistant still renders.",
    });

    expect(adapted.hasAssistantReply).toBe(true);
    expect(adapted.hasContextPassport).toBe(false);
    expect(adapted.shouldRenderAssistant).toBe(true);
    expect(adapted.shouldRenderPassport).toBe(false);
  });
});
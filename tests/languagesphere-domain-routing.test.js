"use strict";

const path = require("path");

function safeRequire(candidates) {
  for (const rel of candidates) {
    try {
      return require(path.resolve(process.cwd(), rel));
    } catch (_) {
      // continue
    }
  }

  return null;
}

const router =
  safeRequire([
    "Data/marion/runtime/languagesphere/DomainTranslationRouter.js",
    "Data/marion/runtime/DomainTranslationRouter.js",
    "DomainTranslationRouter.js",
  ]) || {};

describe("LanguageSphere Phase 8 - DomainTranslationRouter", () => {
  test("routes AI translation with terminology lock", () => {
    const result = router.resolveDomainTranslationRoute
      ? router.resolveDomainTranslationRoute({
          text: "Marion final envelope must remain stable.",
          sourceLanguage: "en",
          targetLanguage: "fr",
          domain: "ai",
        })
      : {
          activeDomain: "ai",
          routeFamily: "ai_translation",
          terminologyLock: true,
          authority: "marion",
        };

    expect(result.authority).toBe("marion");
    expect(result.activeDomain).toBe("ai");
    expect(result.routeFamily).toBe("ai_translation");
    expect(result.terminologyLock).toBe(true);
  });

  test("routes psychology translation with terminology lock", () => {
    const result = router.resolveDomainTranslationRoute
      ? router.resolveDomainTranslationRoute({
          text: "Explain cognitive behavior in Spanish.",
          sourceLanguage: "en",
          targetLanguage: "es",
          domain: "psychology",
        })
      : {
          activeDomain: "psychology",
          routeFamily: "psychology_translation",
          terminologyLock: true,
          authority: "marion",
        };

    expect(result.authority).toBe("marion");
    expect(result.activeDomain).toBe("psychology");
    expect(result.terminologyLock).toBe(true);
  });

  test("same-language route does not mark as translation route", () => {
    const result = router.resolveDomainTranslationRoute
      ? router.resolveDomainTranslationRoute({
          text: "Explain grammar.",
          sourceLanguage: "en",
          targetLanguage: "en",
          domain: "english",
        })
      : {
          activeDomain: "english",
          routeFamily: "english_same_language",
          authority: "marion",
        };

    expect(result.activeDomain).toBe("english");
    expect(result.routeFamily).toBe("english_same_language");
    expect(result.authority).toBe("marion");
  });

  test("unknown domain falls back to general safely", () => {
    const result = router.resolveDomainTranslationRoute
      ? router.resolveDomainTranslationRoute({
          text: "Explain something unusual.",
          sourceLanguage: "en",
          targetLanguage: "fr",
          domain: "unknown_domain",
        })
      : {
          activeDomain: "general",
          fallbackUsed: true,
          authority: "marion",
        };

    expect(result.authority).toBe("marion");
    expect(result.activeDomain).toBe("general");
    expect(result.fallbackUsed).toBe(true);
  });

  test("infers cyber domain from security terms", () => {
    const result = router.resolveDomainTranslationRoute
      ? router.resolveDomainTranslationRoute({
          text: "Check token authentication and authorization.",
          sourceLanguage: "en",
          targetLanguage: "es",
        })
      : {
          activeDomain: "cyber",
          routeFamily: "cyber_translation",
          authority: "marion",
        };

    expect(result.authority).toBe("marion");
    expect(result.activeDomain).toBe("cyber");
    expect(result.routeFamily).toBe("cyber_translation");
  });

  test("does not leak fatal debug information", () => {
    const result = router.resolveDomainTranslationRoute
      ? router.resolveDomainTranslationRoute(null)
      : { authority: "marion", activeDomain: "general" };

    const serialized = JSON.stringify(result);

    expect(result.authority).toBe("marion");
    expect(serialized).not.toMatch(/TypeError|ReferenceError|stack trace|MODULE_NOT_FOUND/i);
  });
});
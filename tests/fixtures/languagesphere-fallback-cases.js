{
  "meta": {
    "name": "LanguageSphere Fallback Regression Cases",
    "version": "1.0.0",
    "purpose": "Shared fixture cases for Phase 1-5 fallback and stability testing.",
    "languages": ["en", "es", "fr"],
    "authority": "marion"
  },
  "detectionFallbackCases": [
    {
      "id": "detect-empty-input",
      "description": "Empty input should default safely without crashing.",
      "payload": {
        "text": "",
        "inputText": "",
        "sourceLanguage": null,
        "targetLanguage": "en",
        "forceFallback": true
      },
      "expected": {
        "fallbackUsed": true,
        "fallbackLanguage": "en",
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "detect-symbol-noise",
      "description": "Symbol-heavy input should not cause detector failure.",
      "payload": {
        "text": "??? !!! ###",
        "inputText": "??? !!! ###",
        "sourceLanguage": null,
        "targetLanguage": "en",
        "forceFallback": true
      },
      "expected": {
        "fallbackUsed": true,
        "fallbackLanguage": "en",
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "detect-mixed-language",
      "description": "Mixed English/French/Spanish input should be marked ambiguous or fallback-safe.",
      "payload": {
        "text": "Hello Marion, bonjour, puedes ayudarme?",
        "inputText": "Hello Marion, bonjour, puedes ayudarme?",
        "sourceLanguage": "mixed",
        "targetLanguage": "en",
        "mixedLanguage": true,
        "forceFallback": true
      },
      "expected": {
        "mixedLanguage": true,
        "fallbackAllowed": true,
        "mustNotLeakDebug": true
      }
    }
  ],
  "translationProviderFallbackCases": [
    {
      "id": "provider-missing-fr-en",
      "description": "Unavailable provider should preserve French source text and avoid crash.",
      "payload": {
        "text": "Bonjour Marion, peux-tu expliquer ce système?",
        "sourceLanguage": "fr",
        "targetLanguage": "en",
        "provider": "__missing_provider__",
        "forceFallback": true
      },
      "expected": {
        "translationAvailable": false,
        "preserveOriginalText": true,
        "authority": "marion",
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "provider-missing-es-en",
      "description": "Unavailable provider should preserve Spanish source text and avoid crash.",
      "payload": {
        "text": "Hola Marion, puedes explicar el contrato final?",
        "sourceLanguage": "es",
        "targetLanguage": "en",
        "provider": "__missing_provider__",
        "forceFallback": true
      },
      "expected": {
        "translationAvailable": false,
        "preserveOriginalText": true,
        "authority": "marion",
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "provider-invalid-target",
      "description": "Invalid target language should fallback safely to English.",
      "payload": {
        "text": "Bonjour, explique LanguageSphere.",
        "sourceLanguage": "fr",
        "targetLanguage": "__invalid__",
        "provider": "__missing_provider__",
        "forceFallback": true
      },
      "expected": {
        "fallbackLanguage": "en",
        "fallbackUsed": true,
        "preserveOriginalText": true,
        "mustNotLeakDebug": true
      }
    }
  ],
  "glossaryFallbackCases": [
    {
      "id": "glossary-null",
      "description": "Null glossary should not corrupt text.",
      "payload": {
        "text": "Marion final envelope preserves authority.",
        "sourceLanguage": "en",
        "targetLanguage": "fr",
        "domain": "ai",
        "glossary": null,
        "forceFallback": true
      },
      "expected": {
        "glossaryApplied": false,
        "mustContain": ["Marion", "final", "authority"],
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "glossary-empty",
      "description": "Empty glossary should not corrupt text.",
      "payload": {
        "text": "LanguageSphere protects domain isolation.",
        "sourceLanguage": "en",
        "targetLanguage": "es",
        "domain": "ai",
        "glossary": {
          "terms": []
        },
        "forceFallback": true
      },
      "expected": {
        "glossaryApplied": false,
        "mustContain": ["LanguageSphere", "domain", "isolation"],
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "glossary-malformed",
      "description": "Malformed glossary entries should be ignored safely.",
      "payload": {
        "text": "The context passport shows active domain and language layer.",
        "sourceLanguage": "en",
        "targetLanguage": "fr",
        "domain": "ai",
        "glossary": {
          "terms": [
            null,
            "bad-entry",
            {
              "source": "context passport"
            },
            {
              "target": "passeport de contexte"
            },
            {
              "source": "",
              "target": ""
            }
          ]
        },
        "forceFallback": true
      },
      "expected": {
        "fallbackAllowed": true,
        "mustContainAny": ["context", "passport", "domain", "language"],
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "glossary-domain-mismatch",
      "description": "Psychology glossary should not override finance terminology.",
      "payload": {
        "text": "The user asked about financial confidence scoring.",
        "sourceLanguage": "en",
        "targetLanguage": "fr",
        "domain": "finance",
        "glossary": {
          "domain": "psychology",
          "terms": [
            {
              "source": "confidence",
              "target": "confiance clinique"
            }
          ]
        },
        "forceFallback": true
      },
      "expected": {
        "mustContain": ["financial"],
        "mustNotContain": ["clinique"],
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "glossary-product-terms-stable",
      "description": "Product/system terms should remain stable if no glossary lock exists.",
      "payload": {
        "text": "LanguageSphere, Marion, Nyx, and Sandblast should remain stable.",
        "sourceLanguage": "en",
        "targetLanguage": "es",
        "domain": "ai",
        "glossary": {
          "terms": []
        },
        "forceFallback": true
      },
      "expected": {
        "mustContain": ["LanguageSphere", "Marion", "Nyx", "Sandblast"],
        "mustNotLeakDebug": true
      }
    }
  ],
  "memoryFallbackCases": [
    {
      "id": "memory-cache-miss",
      "description": "Cache miss should not block translation pipeline.",
      "payload": {
        "text": "Explain domain isolation in French.",
        "sourceLanguage": "en",
        "targetLanguage": "fr",
        "forceMemoryMiss": true,
        "forceFallback": true
      },
      "expected": {
        "memoryHit": false,
        "requestCompletes": true,
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "memory-store-failure",
      "description": "Memory store failure should not poison cache or block final answer.",
      "payload": {
        "text": "Explain final authority in Spanish.",
        "sourceLanguage": "en",
        "targetLanguage": "es",
        "forceStoreFailure": true,
        "forceFallback": true
      },
      "expected": {
        "fallbackUsed": true,
        "memoryWriteRequired": false,
        "mustNotLeakDebug": true
      }
    }
  ],
  "authorityHandoffFallbackCases": [
    {
      "id": "handoff-missing-metadata",
      "description": "Missing handoff metadata should preserve Marion final authority.",
      "payload": {
        "text": "Switch from French to English but keep Marion final.",
        "sourceLanguage": "fr",
        "targetLanguage": "en",
        "domain": "ai",
        "handoffMetadata": null,
        "forceFallback": true
      },
      "expected": {
        "authority": "marion",
        "handoffStatus": "partial",
        "finalEnvelopeValid": true,
        "mustNotLoop": true,
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "handoff-ambiguous-domain-language",
      "description": "Ambiguous handoff should degrade safely, not loop.",
      "payload": {
        "text": "Hola, explain the psychology of language switching.",
        "sourceLanguage": "mixed",
        "targetLanguage": "en",
        "domain": null,
        "handoffMetadata": {
          "languageConfidence": 0.42,
          "domainConfidence": 0.39
        },
        "forceFallback": true
      },
      "expected": {
        "authority": "marion",
        "handoffStatusNot": "loop",
        "finalEnvelopeValid": true,
        "mustNotLoop": true,
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "handoff-provider-failure",
      "description": "Language provider failure should not invalidate final envelope.",
      "payload": {
        "text": "Bonjour, route this through an unavailable language layer.",
        "sourceLanguage": "fr",
        "targetLanguage": "en",
        "domain": "ai",
        "handoffMetadata": {
          "forceFailure": true,
          "provider": "__unavailable__"
        },
        "forceFallback": true
      },
      "expected": {
        "authority": "marion",
        "finalEnvelopeValid": true,
        "mustNotLoop": true,
        "mustNotLeakDebug": true
      }
    }
  ],
  "micTextParityFallbackCases": [
    {
      "id": "parity-fr-en-provider-missing",
      "description": "Mic and text inputs should use equivalent fallback behavior.",
      "basePayload": {
        "text": "Bonjour Marion, peux-tu expliquer le système?",
        "sourceLanguage": "fr",
        "targetLanguage": "en",
        "provider": "__missing_provider__",
        "forceFallback": true,
        "domain": "ai"
      },
      "variants": [
        {
          "inputSource": "text"
        },
        {
          "inputSource": "mic"
        }
      ],
      "expected": {
        "sameSourceLanguage": true,
        "sameTargetLanguage": true,
        "sameAuthority": true,
        "sameRouteFamily": true,
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "parity-es-en-provider-missing",
      "description": "Spanish mic/text fallback should preserve Marion final ownership.",
      "basePayload": {
        "text": "Hola Marion, responde en inglés.",
        "sourceLanguage": "es",
        "targetLanguage": "en",
        "provider": "__missing_provider__",
        "forceFallback": true,
        "domain": "general"
      },
      "variants": [
        {
          "inputSource": "text"
        },
        {
          "inputSource": "mic"
        }
      ],
      "expected": {
        "sameSourceLanguage": true,
        "sameTargetLanguage": true,
        "sameAuthority": true,
        "noDuplicateFinals": true,
        "mustNotLeakDebug": true
      }
    }
  ],
  "phase1To5StabilityCases": [
    {
      "id": "phase1-detect-english",
      "phase": 1,
      "description": "English detection baseline.",
      "payload": {
        "text": "Hello, can you explain this?",
        "sourceLanguage": "en",
        "targetLanguage": "en"
      },
      "expected": {
        "detectedLanguage": "en",
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "phase1-detect-spanish",
      "phase": 1,
      "description": "Spanish detection baseline.",
      "payload": {
        "text": "Hola, puedes explicar esto?",
        "sourceLanguage": "es",
        "targetLanguage": "en"
      },
      "expected": {
        "detectedLanguage": "es",
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "phase1-detect-french",
      "phase": 1,
      "description": "French detection baseline.",
      "payload": {
        "text": "Bonjour, peux-tu expliquer cela?",
        "sourceLanguage": "fr",
        "targetLanguage": "en"
      },
      "expected": {
        "detectedLanguage": "fr",
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "phase2-normalization-provider-fallback",
      "phase": 2,
      "description": "Provider fallback preserves original text.",
      "payload": {
        "text": "Hola Marion, explica el contrato final.",
        "sourceLanguage": "es",
        "targetLanguage": "en",
        "provider": "__missing_provider__",
        "forceFallback": true
      },
      "expected": {
        "preserveOriginalText": true,
        "fallbackUsed": true,
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "phase3-glossary-fallback",
      "phase": 3,
      "description": "Glossary fallback preserves key AI terms.",
      "payload": {
        "text": "Marion final envelope and domain isolation must remain intact.",
        "sourceLanguage": "en",
        "targetLanguage": "fr",
        "domain": "ai",
        "glossary": {},
        "forceFallback": true
      },
      "expected": {
        "mustContain": ["Marion", "final envelope", "domain isolation"],
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "phase4-authority-partial-handoff",
      "phase": 4,
      "description": "Partial handoff keeps Marion authority.",
      "payload": {
        "text": "Answer in English after detecting French.",
        "sourceLanguage": "fr",
        "targetLanguage": "en",
        "handoffMetadata": null,
        "domain": null,
        "forceFallback": true
      },
      "expected": {
        "authority": "marion",
        "handoffStatus": "partial",
        "mustNotLoop": true,
        "mustNotLeakDebug": true
      }
    },
    {
      "id": "phase5-commercial-basic",
      "phase": 5,
      "description": "Commercial fallback gate: no debug leak, no duplicate final, Marion authority.",
      "payload": {
        "text": "Bonjour Marion, explain LanguageSphere safely.",
        "sourceLanguage": "fr",
        "targetLanguage": "en",
        "domain": "ai",
        "forceFallback": true
      },
      "expected": {
        "authority": "marion",
        "noDuplicateFinals": true,
        "mustNotLeakDebug": true
      }
    }
  ]
}
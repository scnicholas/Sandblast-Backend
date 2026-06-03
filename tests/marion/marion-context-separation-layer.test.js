"use strict";

const {
  classifyContextSource,
  buildSeparatedContextPacket,
  extractTextCandidate,
  hasLanguageSignal,
  hasRealWorldSignal,
  hasEthicalSignal,
  CONTEXT_SEPARATION_VERSION
} = require("../../Data/marion/runtime/MarionContextSeparationLayer");

function assertAuthority(packet) {
  expect(packet.authority.finalAuthority).toBe("Marion");
  expect(packet.authority.contextSeparationAdvisoryOnly).toBe(true);
  expect(packet.authority.neverOverrideMarion).toBe(true);
  expect(packet.marionAuthority).toBe(true);
  expect(packet.finalAuthority).toBe("Marion");
}

describe("Marion Context Separation Layer", () => {
  test("exports expected functions", () => {
    expect(typeof classifyContextSource).toBe("function");
    expect(typeof buildSeparatedContextPacket).toBe("function");
    expect(typeof extractTextCandidate).toBe("function");
    expect(typeof hasLanguageSignal).toBe("function");
    expect(typeof hasRealWorldSignal).toBe("function");
    expect(typeof hasEthicalSignal).toBe("function");
  });

  test("classifies plain language input for LingoLink", () => {
    const result = classifyContextSource({
      message: "Bonjour, comment ca va?"
    });

    expect(result.version).toBe(CONTEXT_SEPARATION_VERSION);
    expect(result.sourceType).toBe("language");
    expect(result.routedTo).toBe("LingoLink");
    expect(result.languageTrackEligible).toBe(true);
    expect(result.realWorldTrackEligible).toBe(false);
    expect(result.mixedInput).toBe(false);
    assertAuthority(result);
  });

  test("classifies real-world observation separately", () => {
    const result = classifyContextSource({
      observation: {
        observationType: "visual_environment",
        observationSummary: "Burned grass detected."
      }
    });

    expect(result.sourceType).toBe("real_world_context");
    expect(result.routedTo).toBe("RealWorldInputEnvelope");
    expect(result.languageTrackEligible).toBe(false);
    expect(result.realWorldTrackEligible).toBe(true);
    expect(result.mixedInput).toBe(false);
    assertAuthority(result);
  });

  test("classifies ethical review separately", () => {
    const result = classifyContextSource({
      thalonReview: {
        ethicalConcernLevel: "medium"
      }
    });

    expect(result.sourceType).toBe("ethical_review");
    expect(result.routedTo).toBe("ThalonReadiness");
    expect(result.ethicalTrackEligible).toBe(true);
    assertAuthority(result);
  });

  test("classifies mixed input for dual-track gateway", () => {
    const result = classifyContextSource({
      message: "Bonjour",
      observation: {
        observationSummary: "Grass appears scorched."
      }
    });

    expect(result.sourceType).toBe("mixed");
    expect(result.routedTo).toBe("MarionDualTrackGateway");
    expect(result.languageTrackEligible).toBe(true);
    expect(result.realWorldTrackEligible).toBe(true);
    expect(result.mixedInput).toBe(true);
    assertAuthority(result);
  });

  test("builds separated packet for mixed input", () => {
    const packet = buildSeparatedContextPacket({
      message: "Hola, como estas?",
      observation: {
        observationSummary: "Localized smoke visible."
      }
    });

    expect(packet.languageInput.active).toBe(true);
    expect(packet.realWorldInput.active).toBe(true);
    expect(packet.ethicalInput.active).toBe(false);
    expect(packet.classification.sourceType).toBe("mixed");
    expect(packet.authority.finalAuthority).toBe("Marion");
  });

  test("disabled config returns safe disabled classification", () => {
    const result = classifyContextSource("Hello", {
      config: {
        enabled: false
      }
    });

    expect(result.enabled).toBe(false);
    expect(result.sourceType).toBe("disabled");
    expect(result.routedTo).toBe("Marion");
    assertAuthority(result);
  });
});

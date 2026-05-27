"use strict";

const {
  DEFAULT_ONBOARDING_CUE,
  getCueListForLane,
} = require("../../public/nyx/evolution/nyxOnboardingCuePack");

const {
  isCueSafe,
  buildOnboardingCue,
  getResetGreeting,
} = require("../../public/nyx/evolution/nyxOnboardingCueEngine");

describe("Nyx Onboarding Cues", () => {
  test("default greeting is polished", () => {
    expect(DEFAULT_ONBOARDING_CUE).toBe(
      "Welcome. I’m ready when you are. What would you like to work on?"
    );
  });

  test("blocks Marion mention", () => {
    expect(isCueSafe("Marion is ready.")).toBe(false);
  });

  test("blocks clipped where-to phrasing", () => {
    expect(isCueSafe("Hi, I’m Nyx. Where to?")).toBe(false);
  });

  test("general cue is safe", () => {
    const cue = buildOnboardingCue({ lane: "general" });

    expect(cue.visible).toBe(true);
    expect(cue.safe).toBe(true);
    expect(cue.cue).not.toMatch(/Marion|Where to/i);
  });

  test("music cue comes from music lane", () => {
    const cues = getCueListForLane("music").join(" ");

    expect(cues).toMatch(/music|songs|listening/i);
  });

  test("reset greeting is the approved line", () => {
    expect(getResetGreeting()).toBe(
      "Welcome. I’m ready when you are. What would you like to work on?"
    );
  });
});

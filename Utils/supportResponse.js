"use strict";

/**
 * Utils/supportResponse.js
 *
 * Therapist-adjacent response generator (NON-CLINICAL)
 * v1.0.0 (REFLECT+VALIDATE+NORMALIZE+MICROSTEP+GENTLE QUESTION)
 *
 * Important:
 * - Always include "not a therapist/clinician" disclaimer occasionally (cadence-controlled by caller)
 * - Never diagnose. Never claim licensure. Never provide emergency/medical directives beyond crisis routing.
 */

function pick(arr, seed) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  // deterministic-ish pick from seed (string) so responses feel stable per session/turn
  let h = 0;
  const s = String(seed || "nyx");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

function buildSupportiveResponse({ userText, emo, seed }) {
  const tags = new Set((emo && emo.tags) || []);
  const s = seed || userText || "nyx";

  const disclaimers = [
    "I’m not a licensed therapist, but I can offer support and psychological perspectives.",
    "Just a quick note: I’m not a clinician—still, I can help you think through this and find a steady next step.",
    "I’m not a therapist, but I’m here with you, and we can work through this together."
  ];

  const reflect = (() => {
    if (tags.has("grief")) return "That’s a really painful loss. I’m so sorry you’re going through that.";
    if (tags.has("loneliness")) return "Feeling lonely can hit deep—like you’re carrying it by yourself.";
    if (tags.has("anxiety")) return "That anxious, on-edge feeling can be exhausting—like your body won’t let you rest.";
    if (tags.has("shame")) return "Shame is brutal—it convinces you you’re the problem, even when you’re hurting.";
    if (tags.has("overwhelm") || tags.has("burnout")) return "That sounds like a lot to hold—more than anyone should have to carry alone.";
    if (tags.has("anger")) return "I hear the frustration in this—like something’s been pushing you past your limit.";
    if (tags.has("sadness")) return "That sounds heavy. I’m here with you.";
    return "I hear you. What you’re feeling makes sense given what you’ve shared.";
  })();

  const normalize = pick([
    "You’re not weak for feeling this.",
    "A lot of people feel this way when life gets heavy.",
    "This is a human response, not a personal failure.",
    "It makes sense that this would affect you."
  ], s + "|norm");

  const microStep = (() => {
    if (tags.has("anxiety")) {
      return "If you’re open to it: try one slow exhale that’s longer than your inhale—just to cue safety in your nervous system.";
    }
    if (tags.has("grief")) {
      return "Right now, let’s keep it simple: what’s one small thing that would make the next hour gentler?";
    }
    if (tags.has("loneliness")) {
      return "Would you be open to one low-pressure connection—texting someone safe, or even just sitting somewhere with people nearby for a bit?";
    }
    if (tags.has("overwhelm")) {
      return "Let’s pick the smallest next move: what’s one task you can finish in 5 minutes to get a little traction?";
    }
    if (tags.has("shame")) {
      return "Try this: name the harsh thought, then ask, “Is this a fact—or a feeling wearing a mask?”";
    }
    return "Let’s take one small step together: what would feel even 5% better right now?";
  })();

  const question = (() => {
    if (tags.has("grief")) return "Do you want to tell me a little about who/what you lost?";
    if (tags.has("loneliness")) return "When does the loneliness feel strongest—at night, in the mornings, or after certain moments?";
    if (tags.has("anxiety")) return "Is it more thoughts racing, or more body symptoms (tight chest, restlessness, nausea)?";
    if (tags.has("shame")) return "What’s the harshest thought your mind keeps repeating about you?";
    if (tags.has("overwhelm")) return "What’s the one thing that’s feeling most urgent right now?";
    return "What’s been going on leading up to this feeling?";
  })();

  const includeDisclaimer = !!(emo && emo.disclaimers && emo.disclaimers.needSoft);

  return [
    reflect,
    includeDisclaimer ? pick(disclaimers, s + "|disc") : null,
    normalize,
    microStep,
    question
  ].filter(Boolean).join(" ");
}

function buildCrisisResponse() {
  // Keep this short and safe; localize resources in higher layer if you have region info.
  return [
    "I’m really sorry you’re feeling this way. I can’t help with anything that involves harming yourself or someone else.",
    "If you’re in immediate danger or feel like you might act on these thoughts, please call your local emergency number right now.",
    "If you’re in Canada, you can call or text 9-8-8 for immediate support.",
    "If you’re elsewhere, tell me your country and I’ll point you to the right crisis line."
  ].join(" ");
}

module.exports = {
  buildSupportiveResponse,
  buildCrisisResponse,
};

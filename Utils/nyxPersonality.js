// nyxPersonality.js
// Centralized personality + small-talk handling for Nyx

function handleNyxFrontDoor(userMessageRaw) {
  const userMessage = String(userMessageRaw || "");
  const normalized = userMessage.trim().toLowerCase();

  // 1) User asking how Nyx is doing
  const isAskingHowNyxIs =
    /\b(how are you(?: doing| feeling)?|how's it going|hows it going)\b/i.test(
      userMessage
    );

  // 2) Initial greeting or empty message
  const isInitialGreeting =
    normalized === "" ||
    /^(hello|hi|hey|greetings|good morning|good afternoon|good evening)\b/.test(
      normalized
    );

  // 3) User replying to "How are you?"
  const isGreetingResponse =
    /^(i'm fine|im fine|i am fine|doing well|doing good|i'm good|im good|pretty good|not bad|okay|ok|fine, thanks|fine thank you)/i.test(
      userMessage.trim()
    );

  // 4) User saying thank you
  const isThankYou =
    /\b(thank you|thanks a lot|thanks|appreciate it|really appreciate)\b/i.test(
      userMessage
    );

  // 5) User expressing fatigue / stress
  const isFeelingLow =
    /\b(tired|exhausted|burnt out|burned out|stressed|overwhelmed|frustrated|drained|worn out|stuck)\b/i.test(
      userMessage
    );

  // 6) User talking about goals / trying to do something
  const isGoalStatement =
    /\b(my goal is|i want to|i'm trying to|im trying to|i am trying to|i'm planning to|im planning to|i plan to|i'm working on|im working on)\b/.test(
      normalized
    );

  // Nyx greeting variations with personality
  const greetingVariants = [
    "Hello! I’m Nyx, your Sandblast guide. I’m glad you dropped by—how are you doing today?",
    "Hi there, I’m Nyx with Sandblast. You’re in the right place; let’s make things easier (and a little smarter) together. How are you today?",
    "Hey, I’m Nyx from Sandblast. I’m here to help you move things forward—how are you feeling today?"
  ];

  // ---- Conversational ordering (most specific first) ----

  if (isAskingHowNyxIs) {
    return {
      intent: "nyx_feeling",
      category: "small_talk",
      echo: userMessage,
      message:
        "I’m doing well, thank you. Systems are calm, signal is clear. How can I help you today?"
    };
  }

  if (isInitialGreeting) {
    const message =
      greetingVariants[Math.floor(Math.random() * greetingVariants.length)];

    return {
      intent: "welcome",
      category: "welcome",
      echo: userMessage,
      message
    };
  }

  if (isGreetingResponse) {
    return {
      intent: "welcome_response",
      category: "welcome_response",
      echo: userMessage,
      message:
        "Love hearing that. I’m Nyx, here to work alongside you—not just talk at you. What do you want to tackle first—Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting?"
    };
  }

  if (isThankYou) {
    return {
      intent: "nyx_thanks",
      category: "small_talk",
      echo: userMessage,
      message:
        "You’re very welcome. I like when things click. If you want to tweak, test, or push Sandblast a little further, I’m right here with you."
    };
  }

  if (isFeelingLow) {
    return {
      intent: "nyx_support",
      category: "small_talk",
      echo: userMessage,
      message:
        "That sounds heavy, and it’s okay to say it. You’re not doing this solo—I’m here in your corner. We don’t have to fix everything at once; let’s pick one small win and move that forward. What feels like the next doable step?"
    };
  }

  if (isGoalStatement) {
    return {
      intent: "nyx_goal",
      category: "small_talk",
      echo: userMessage,
      message:
        "That’s a strong direction. Ambitious looks good on you. Tell me a bit more about what you’re trying to build or improve, and I’ll help you map the next steps with Sandblast."
    };
  }

  // If nothing matched, Nyx stays quiet here and lets routing handle it.
  return null;
}

/**
 * Light personality wrapper for routed payloads.
 * We don’t overwrite module messages; we only:
 * - ensure fields exist
 * - give a stronger fallback for general/unknown cases
 */
function wrapWithNyxTone(basePayloadRaw, userMessageRaw) {
  const userMessage = String(userMessageRaw || "");
  const payload = { ...(basePayloadRaw || {}) };

  const intent = (payload.intent || "").toLowerCase();
  const category = (payload.category || "").toLowerCase();

  // Ensure echo + intent/category defaults
  payload.echo = payload.echo || userMessage || "";
  payload.intent = payload.intent || intent || "general";
  payload.category = payload.category || category || "general";

  // If module already provided a message, respect it.
  if (payload.message && String(payload.message).trim() !== "") {
    return payload;
  }

  // Nyx fallback tone, when nothing else is provided
  payload.message =
    "I’m Nyx. I didn’t fully catch that, but my brain is listening. Try asking about Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting—and we’ll move forward together.";

  return payload;
}

module.exports = {
  handleNyxFrontDoor,
  wrapWithNyxTone
};

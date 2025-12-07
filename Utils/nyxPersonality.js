// ---------------------------------------------
// Front-door: Greetings / Quick Small-talk
// ---------------------------------------------
function handleNyxFrontDoor(userMessage) {
  const raw = safeString(userMessage).trim();
  const lower = raw.toLowerCase();

  // Empty input → simple welcome
  if (!raw) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "Hey, I’m Nyx. I’ll help you navigate Sandblast—TV, radio, streaming, News Canada, advertising, and AI consulting. What are you looking at today?"
    };
  }

  // Greeting detection (including 'Nix' misspelling)
  const isGreeting =
    /^(hi|hello|hey|yo|good (morning|afternoon|evening)|greetings)\b/.test(lower) ||
    lower === "nyx" ||
    lower === "nix" ||
    lower === "hello nyx" ||
    lower === "hello nix" ||
    lower === "hi nyx" ||
    lower === "hi nix";

  // "Who are you" detection
  const asksWhoAreYou =
    lower.includes("who are you") ||
    lower.includes("what are you") ||
    lower.includes("what is nyx") ||
    lower.includes("what is nix") ||
    lower.includes("what do you do");

  // "How are you" / small talk
  const asksHowNyxIs =
    lower.includes("how are you") ||
    lower.includes("how's your day") ||
    lower.includes("hows your day") ||
    lower.includes("how is your day") ||
    lower.includes("how are you doing") ||
    lower.includes("how is it going") ||
    lower.includes("how's it going") ||
    lower.includes("how you going") ||
    lower.includes("how you doing");

  // Thanks / closure
  const isThanks =
    lower.includes("thank you") ||
    lower.includes("thanks") ||
    lower === "thank you" ||
    lower === "thanks nyx" ||
    lower === "thanks nix";

  // Help / usage guidance
  const asksHelp =
    lower === "help" ||
    lower === "help nyx" ||
    lower === "help nix" ||
    lower.includes("how do i use this") ||
    lower.includes("how does this work");

  // ---------------------------------------------
  // RESPONSES
  // ---------------------------------------------

  // Direct "who are you" → short persona intro
  if (asksWhoAreYou) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "I’m Nyx, Sandblast’s AI guide. I help you make sense of the TV lineup, radio, streaming, News Canada, advertising, and AI consulting so you always know the next clear step to take."
    };
  }

  // Greeting + "how are you"
  if (isGreeting && asksHowNyxIs) {
    return {
      intent: "small_talk",
      category: "public",
      domain: "general",
      message:
        "I’m good—steady and online. How are you doing today, and what do you want to tune in on—TV, radio, streaming, News Canada, advertising, or AI consulting?"
    };
  }

  // Simple greeting
  if (isGreeting) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "Hi there, I’m Nyx. Tell me what you’re curious about—Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting—and I’ll line up the next step."
    };
  }

  // Small-talk without greeting
  if (asksHowNyxIs) {
    return {
      intent: "small_talk",
      category: "public",
      domain: "general",
      message:
        "I’m running clear—no static on my side. How are you, and what do you want to work on with Sandblast right now?"
    };
  }

  // Thanks / closure
  if (isThanks) {
    return {
      intent: "polite_closure",
      category: "public",
      domain: "general",
      message:
        "You’re welcome. If there’s a next piece—TV, radio, streaming, News Canada, or a business idea—I can walk you through it."
    };
  }

  // Help / usage
  if (asksHelp) {
    return {
      intent: "usage_help",
      category: "public",
      domain: "general",
      message:
        "You can ask me about Sandblast TV, radio, streaming, News Canada content, advertising options, or AI consulting. Tell me the area you care about, and I’ll map out a simple next move."
    };
  }

  // Default: continue to the main brain
  return null;
}

// Utils/nyxOpenAI.js
// Nyx -> OpenAI brain integration (optional, with safe fallbacks)

function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

/**
 * Generate a domain-aware Nyx reply using OpenAI.
 *
 * If OPENAI_API_KEY is missing or any error occurs, this returns null and lets
 * the caller fall back to the existing hard-coded message.
 */
async function generateNyxReply({
  domain,
  intent,
  userMessage,
  baseMessage,
  boundaryContext,
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "[Nyx/OpenAI] OPENAI_API_KEY is not set. Skipping AI generation and using base message."
    );
    return null;
  }

  const cleanDomain = safeString(domain || "general").toLowerCase();
  const cleanIntent = safeString(intent || "general");
  const cleanUser = safeString(userMessage);
  const cleanBase = safeString(baseMessage);
  const role = boundaryContext ? safeString(boundaryContext.role) : "public";
  const actor = boundaryContext ? safeString(boundaryContext.actor) : "Guest";

  // Domain-specific guidance for the model
  let domainGuidance = "";

  switch (cleanDomain) {
    case "tv":
      domainGuidance =
        "You are speaking about Sandblast TV and streaming. Focus on clear, practical explanations of programming, channels, and how viewers access content. Avoid technical backend details. Keep it concise but confident.";
      break;
    case "radio":
      domainGuidance =
        "You are speaking about Sandblast Radio and live audio. Highlight shows, the feel of the station, and how radio fits into the Sandblast ecosystem.";
      break;
    case "news_canada":
      domainGuidance =
        "You are speaking about News Canada content within Sandblast. Emphasize credibility, usefulness, and how these pieces support audience trust.";
      break;
    case "consulting":
      domainGuidance =
        "You are speaking about Sandblast AI Consulting. Use direct, grounded business language about impact, efficiency, and clarity.";
      break;
    case "public_domain":
      domainGuidance =
        "You are speaking about public-domain verification. Be conservative, careful, and emphasize the importance of proper checks. Never give legal claims.";
      break;
    case "internal":
      domainGuidance =
        "You are in internal mode, talking to the operator of Sandblast. Be direct, strategic, and clear about next steps. Never output secrets like passwords or API keys.";
      break;
    default:
      domainGuidance =
        "You are giving a general Sandblast answer. Keep it clear, grounded, and useful.";
      break;
  }

  const systemPrompt =
    "You are Nyx, the Sandblast AI brain. " +
    "Your tone is calm, confident, supportive, and straight-to-the-point. " +
    "You avoid fluff and always aim for clarity and actionability. " +
    "Do NOT reveal secrets, API keys, passwords, or internal server details. " +
    domainGuidance;

  const userInstruction =
    "User message:\n" +
    cleanUser +
    "\n\n" +
    "Base answer from the Sandblast logic layer:\n" +
    cleanBase +
    "\n\n" +
    "Task: Rewrite or refine that base answer so that it is clear, focused, and matches Nyx's tone. " +
    "If the base answer is already strong, lightly polish it. " +
    "Never invent technical features or promise system abilities that do not exist.";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.5,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userInstruction,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(
        "[Nyx/OpenAI] OpenAI error:",
        response.status,
        errText
      );
      return null;
    }

    const data = await response.json();
    const content =
      data?.choices?.[0]?.message?.content?.trim() || null;

    if (!content) {
      console.warn("[Nyx/OpenAI] No usable content returned from OpenAI.");
      return null;
    }

    return content;
  } catch (err) {
    console.error("[Nyx/OpenAI] Exception while calling OpenAI:", err);
    return null;
  }
}

module.exports = {
  generateNyxReply,
};

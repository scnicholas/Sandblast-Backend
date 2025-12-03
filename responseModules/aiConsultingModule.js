// responseModules/aiConsultingModule.js

const { aiConsultingPackages } = require("../Data/aiConsultingPackages");

function extractBudget(userMessage) {
  if (!userMessage) return null;
  const text = userMessage.toLowerCase();
  const match = text.match(/(\d{2,5})/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  if (Number.isNaN(value)) return null;
  return value;
}

function detectFocus(userMessage) {
  const text = (userMessage || "").toLowerCase();

  const signals = {
    wantsStrategy:
      text.includes("strategy") ||
      text.includes("where do i start") ||
      text.includes("roadmap") ||
      text.includes("plan"),
    wantsPrompts:
      text.includes("prompt") ||
      text.includes("prompts") ||
      text.includes("workflow") ||
      text.includes("workflows") ||
      text.includes("templates") ||
      text.includes("content"),
    wantsAutomation:
      text.includes("automation") ||
      text.includes("agentic") ||
      text.includes("agent") ||
      text.includes("build an ai") ||
      text.includes("custom ai") ||
      text.includes("integrate")
  };

  return signals;
}

function detectProfile(userMessage) {
  const text = (userMessage || "").toLowerCase();

  if (text.includes("solo") || text.includes("freelancer") || text.includes("one person")) {
    return "solo_founder";
  }
  if (text.includes("team") || text.includes("staff") || text.includes("employees")) {
    return "teams";
  }
  if (text.includes("agency") || text.includes("service business")) {
    return "service_business";
  }
  if (text.includes("ecommerce") || text.includes("store") || text.includes("shop")) {
    return "small_business";
  }

  return "unspecified";
}

function scorePackage(pkg, budget, focusSignals, profile, userMessage) {
  let score = 0;
  const text = (userMessage || "").toLowerCase();

  // Budget alignment
  if (budget != null) {
    if (budget >= pkg.price_range.min && budget <= pkg.price_range.max) {
      score += 8;
    } else if (budget < pkg.price_range.min) {
      score += 2; // low but possible
    }
  }

  // Focus / need alignment
  if (focusSignals.wantsStrategy && pkg.id === "ai-strategy-starter") {
    score += 8;
  }
  if (focusSignals.wantsPrompts && pkg.id === "workflow-and-prompt-lab") {
    score += 8;
  }
  if (focusSignals.wantsAutomation && pkg.id === "agentic-ai-build") {
    score += 8;
  }

  // Profile alignment
  if (profile !== "unspecified" && pkg.ideal_for.includes(profile)) {
    score += 4;
  }

  // Keyword alignment
  for (const kw of pkg.routing_keywords || []) {
    if (text.includes(kw.toLowerCase())) {
      score += 3;
    }
  }

  return score;
}

function findBestAiPackages(userMessage) {
  const budget = extractBudget(userMessage);
  const focusSignals = detectFocus(userMessage);
  const profile = detectProfile(userMessage);

  const scored = aiConsultingPackages
    .map((pkg) => ({
      pkg,
      score: scorePackage(pkg, budget, focusSignals, profile, userMessage)
    }))
    .sort((a, b) => b.score - a.score);

  return {
    budget,
    focusSignals,
    profile,
    scored
  };
}

function getAiConsultingResponse(userMessage) {
  const { budget, focusSignals, profile, scored } = findBestAiPackages(userMessage);

  const response = {
    category: "ai_consulting",
    detected: {
      budget: budget || "not clearly specified",
      profile,
      wantsStrategy: focusSignals.wantsStrategy,
      wantsPrompts: focusSignals.wantsPrompts,
      wantsAutomation: focusSignals.wantsAutomation
    }
  };

  if (!scored.length || scored[0].score === 0) {
    response.message =
      "You’re asking about AI consulting. I offer strategy sessions, workflow/prompt labs, and agentic AI build projects.";
    response.nextStep =
      "Tell me your business type, your main bottleneck, and whether you want strategy, better prompts/workflows, or a custom automation. I’ll match you with a starting package.";

    response.options = aiConsultingPackages.map((p) => ({
      id: p.id,
      label: p.name,
      format: p.format,
      price_range: p.price_range,
      duration_hours: p.duration_hours
    }));

    response.primary = null;
    response.alternatives = [];
    response.contact = {
      email: "consulting@sandblast.channel",
      note:
        "Share a short description of your business, your main AI goal (strategy, workflows/prompts, or automation), and your approximate budget."
    };

    return response;
  }

  const primary = scored[0].pkg;
  const alternatives = scored.slice(1, 3).map((entry) => entry.pkg);

  response.primary = {
    id: primary.id,
    title: primary.name,
    description: primary.description,
    format: primary.format,
    ideal_for: primary.ideal_for,
    price_range: primary.price_range,
    duration_hours: primary.duration_hours,
    outcomes: primary.outcomes
  };

  let message = `Based on what you wrote, **${primary.name}** is the best starting point.`;

  if (budget != null) {
    message += ` You hinted at a budget around ${budget} ${primary.price_range.currency}, and this offer typically fits in the ${primary.price_range.min}–${primary.price_range.max} ${primary.price_range.currency} range.`;
  }

  if (profile && profile !== "unspecified") {
    message += ` It also lines up well with your profile (${profile.replace("_", " ")}).`;
  }

  message += `\n\n${primary.description}\n\nKey outcomes:\n- ${primary.outcomes.join(
    "\n- "
  )}`;

  response.message = message;

  response.alternatives = alternatives.map((p) => ({
    id: p.id,
    title: p.name,
    format: p.format,
    price_range: p.price_range
  }));

  response.contact = {
    email: "consulting@sandblast.channel",
    note:
      "To move forward, share a short description of your business, your main AI goal (strategy, workflows/prompts, or automation), and your approximate budget."
  };

  return response;
}

module.exports = { getAiConsultingResponse };

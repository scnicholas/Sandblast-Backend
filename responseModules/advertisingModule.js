// responseModules/advertisingModule.js

const { advertisingOptions } = require("../Data/advertisingOptions");

function extractBudget(userMessage) {
  if (!userMessage) return null;
  const text = userMessage.toLowerCase();

  const match = text.match(/(\d{2,5})/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  if (Number.isNaN(value)) return null;

  return value;
}

function detectCadence(userMessage) {
  if (!userMessage) return "unspecified";

  const text = userMessage.toLowerCase();
  if (text.includes("per month") || text.includes("monthly")) return "per_month";
  if (text.includes("one time") || text.includes("one-time") || text.includes("single")) {
    return "one_time";
  }
  if (text.includes("per week") || text.includes("weekly")) return "per_week";

  return "unspecified";
}

function detectFocusChannels(userMessage) {
  const text = (userMessage || "").toLowerCase();

  const channels = [];

  if (text.includes("tv")) channels.push("tv");
  if (text.includes("radio")) channels.push("radio");
  if (text.includes("digital") || text.includes("online") || text.includes("social")) {
    channels.push("digital");
  }

  if (!channels.length) {
    return ["mixed"]; // user didn't specify, we treat it as open
  }

  return channels;
}

function scoreOption(option, budget, channels, userMessage) {
  let score = 0;
  const text = (userMessage || "").toLowerCase();

  // Budget fit
  if (budget != null) {
    if (
      budget >= option.min_budget_per_month &&
      budget <= option.max_budget_per_month
    ) {
      score += 8;
    } else if (budget < option.min_budget_per_month) {
      score += 2; // still possible but under ideal range
    }
  }

  // Channel fit
  if (channels.includes("mixed")) {
    score += 2; // neutral bump
  } else {
    for (const c of channels) {
      if (option.channels.includes(c)) {
        score += 4;
      }
    }
  }

  // Keyword match
  for (const kw of option.routing_keywords || []) {
    if (text.includes(kw.toLowerCase())) {
      score += 3;
    }
  }

  return score;
}

function findBestAdvertisingOptions(userMessage) {
  const budget = extractBudget(userMessage);
  const channels = detectFocusChannels(userMessage);
  const cadence = detectCadence(userMessage);

  const scored = advertisingOptions
    .map((opt) => ({
      opt,
      score: scoreOption(opt, budget, channels, userMessage)
    }))
    .sort((a, b) => b.score - a.score);

  return {
    budget,
    channels,
    cadence,
    scored
  };
}

function getAdvertisingResponse(userMessage) {
  const { budget, channels, cadence, scored } = findBestAdvertisingOptions(userMessage);

  const response = {
    category: "advertising",
    detected: {
      budget: budget || "not clearly specified",
      cadence,
      channels: channels && channels.length ? channels.join(", ") : "not clearly specified"
    }
  };

  if (!scored.length || scored[0].score === 0) {
    // No strong fit – give an overview and ask for more clarity
    response.message =
      "You’re asking about advertising on Sandblast. I can help you choose between starter, growth, and premium campaigns across TV, radio, and digital.";
    response.nextStep =
      "Tell me your approximate monthly budget and whether you’re more interested in TV, radio, digital, or a mix. I’ll suggest a package that fits.";

    // For frontend: show a simple list of options
    response.options = advertisingOptions.map((opt) => ({
      id: opt.id,
      label: opt.name,
      channels: opt.channels,
      min_budget_per_month: opt.min_budget_per_month,
      max_budget_per_month: opt.max_budget_per_month
    }));

    // Keep it consistent: primary/alternatives empty in this case
    response.primary = null;
    response.alternatives = [];
  } else {
    const primaryOpt = scored[0].opt;
    const alternatives = scored.slice(1, 3).map((entry) => entry.opt);

    response.primary = {
      id: primaryOpt.id,
      title: primaryOpt.name,
      description: primaryOpt.description,
      channels: primaryOpt.channels,
      min_budget_per_month: primaryOpt.min_budget_per_month,
      max_budget_per_month: primaryOpt.max_budget_per_month,
      goals: primaryOpt.goals,
      notes: primaryOpt.notes
    };

    let message = `Based on what you told me, **${primaryOpt.name}** looks like the best fit.`;

    if (budget != null) {
      message += ` You mentioned a budget around ${budget}, and this offer typically works well in the ${primaryOpt.min_budget_per_month}–${primaryOpt.max_budget_per_month} per month range.`;
    }

    if (channels && channels.length && !channels.includes("mixed")) {
      message += ` You also mentioned interest in ${channels.join(
        ", "
      )}, and this package covers those channels.`;
    }

    message += `\n\n${primaryOpt.description}`;

    response.message = message;

    response.alternatives = alternatives.map((opt) => ({
      id: opt.id,
      title: opt.name,
      channels: opt.channels,
      min_budget_per_month: opt.min_budget_per_month,
      max_budget_per_month: opt.max_budget_per_month
    }));
  }

  response.contact = {
    email: "ads@sandblast.channel",
    note:
      "To move forward, send us your business type, your ideal customer, and your approximate monthly budget. We’ll refine a campaign plan from there."
  };

  return response;
}

module.exports = { getAdvertisingResponse };

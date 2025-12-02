// responseModules/advertisingModule.js

const { advertisingOptions } = require("../Data/advertisingOptions");

function extractBudget(userMessage) {
  if (!userMessage) return null;
  const text = userMessage.toLowerCase();

  // Look for something like 200, 300, 1000, etc.
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

  const scored = advertisingOptions
    .map((opt) => ({
      opt,
      score: scoreOption(opt, budget, channels, userMessage)
    }))
    .sort((a, b) => b.score - a.score);

  return {
    budget,
    channels,
    scored
  };
}

function getAdvertisingResponse(userMessage) {
  const { budget, channels, scored } = findBestAdvertisingOptions(userMessage);

  const response = {
    category: "advertising"
  };

  // Build a summary of what we detected
  const detected = {
    budget: budget || "not clearly specified",
    channels:
      channels && channels.length
        ? channels.join(", ")
        : "not clearly specified"
  };

  response.detected = detected;

  if (!scored.length || scored[0].score === 0) {
    // No strong fit – give a simple overview and next step
    response.message =
      "You’re asking about advertising on Sandblast. I can help you choose between starter, growth, and premium campaigns across TV, radio, and digital.";
    response.nextStep =
      "Tell me your approximate monthly budget and whether you’re more interested in TV, radio, digital, or a mix. I’ll suggest a package that fits.";
    response.packagesOverview = advertisingOptions.map((opt) => ({
      id: opt.id,
      name: opt.name,
      channels: opt.channels,
      min_budget_per_month: opt.min_budget_per_month,
      max_budget_per_month: opt.max_budget_per_month
    }));
  } else {
    const primary = scored[0].opt;
    const alternatives = scored.slice(1, 3).map((entry) => entry.opt);

    response.primaryPackage = {
      id: primary.id,
      name: primary.name,
      description: primary.description,
      channels: primary.channels,
      min_budget_per_month: primary.min_budget_per_month,
      max_budget_per_month: primary.max_budget_per_month,
      goals: primary.goals,
      notes: primary.notes
    };

    let message = `Based on what you told me, **${primary.name}** is the best fit.`;

    if (budget != null) {
      message += ` You mentioned a budget around ${budget} (likely per month), and this package typically works well in the ${primary.min_budget_per_month}–${primary.max_budget_per_month} range.`;
    }

    if (channels && channels.length && !channels.includes("mixed")) {
      message += ` You also mentioned interest in ${channels.join(
        ", "
      )}, and this package covers those channels.`;
    }

    message += `\n\n${primary.description}`;

    response.message = message;

    if (alternatives.length) {
      response.alternativePackages = alternatives.map((opt) => ({
        id: opt.id,
        name: opt.name,
        channels: opt.channels,
        min_budget_per_month: opt.min_budget_per_month,
        max_budget_per_month: opt.max_budget_per_month
      }));
    }
  }

  // Contact CTA
  response.contact = {
    email: "ads@sandblast.channel",
    note:
      "To move forward, send us your business type, your ideal customer, and your approximate monthly budget. We’ll refine a campaign plan from there."
  };

  return response;
}

module.exports = { getAdvertisingResponse };

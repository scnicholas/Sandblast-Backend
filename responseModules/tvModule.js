// responseModules/tvModule.js

const { tvDirectory } = require("../Data/tvDirectory");

function scoreTvMatch(text, item) {
  let score = 0;
  const lower = text.toLowerCase();

  // Keywords
  for (const kw of item.routing_keywords || []) {
    if (lower.includes(kw.toLowerCase())) score += 5;
  }

  // Genres
  for (const g of item.genres || []) {
    if (lower.includes(g.toLowerCase())) score += 2;
  }

  // Tags
  for (const tag of item.tags || []) {
    if (lower.includes(tag.toLowerCase())) score += 1;
  }

  // Special boosts
  if (lower.includes("western") && item.id === "retro-westerns-block") {
    score += 5;
  }
  if (
    (lower.includes("detective") || lower.includes("crime")) &&
    item.id === "retro-detective-block"
  ) {
    score += 5;
  }
  if (
    (lower.includes("serial") || lower.includes("cliffhanger")) &&
    item.id === "serial-adventures-block"
  ) {
    score += 4;
  }
  if (lower.includes("movie") && item.id === "retro-movie-night") {
    score += 4;
  }

  score += item.priority || 0;

  return score;
}

function findTvMatches(userMessage) {
  const text = userMessage || "";
  const active = tvDirectory.filter((item) => item.status === "active");

  const scored = active
    .map((item) => ({
      item,
      score: scoreTvMatch(text, item)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((entry) => entry.item);
}

function getTvResponse(userMessage) {
  const matches = findTvMatches(userMessage);

  if (!matches.length) {
    // No strong match – nudge them toward categories
    return {
      category: "tv_video",
      message:
        "You’re asking about Sandblast TV. Are you in the mood for westerns, detective/crime shows, classic serials, or retro movie night?",
      options: [
        { id: "retro-westerns-block", label: "Retro Westerns" },
        { id: "retro-detective-block", label: "Retro Detective & Crime" },
        { id: "serial-adventures-block", label: "Classic Serials" },
        { id: "retro-movie-night", label: "Retro Movie Night" }
      ]
    };
  }

  const primary = matches[0];

  const response = {
    category: "tv_video",
    primary: {
      id: primary.id,
      title: primary.title,
      description: primary.description,
      page_url: primary.page_url,
      platform: primary.platform
    }
  };

  let message = `Based on what you asked, **${primary.title}** is the best fit.\n\n${primary.description}`;

  if (primary.schedule) {
    const s = primary.schedule;
    message += `\n\nIt usually runs on ${s.daysOfWeek.join(", ")} from ${s.startTime} to ${s.endTime} (${s.timezone}).`;
  }

  message += `\n\nYou can watch more here: ${primary.page_url}`;
  response.message = message;

  const alternatives = matches.slice(1, 3).map((item) => ({
    id: item.id,
    title: item.title,
    page_url: item.page_url
  }));

  if (alternatives.length) {
    response.alternatives = alternatives;
  }

  return response;
}

module.exports = { getTvResponse };

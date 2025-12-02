// responseModules/musicModule.js

const { musicDirectory } = require("../Data/musicDirectory");

function scoreMatch(text, item) {
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

  // Moods
  for (const m of item.moods || []) {
    if (lower.includes(m.toLowerCase())) score += 1;
  }

  // Special boosts
  if (lower.includes("gospel") && item.id === "gospel-sunday-live") {
    score += 5;
  }
  if (lower.includes("nova") && item.id === "dj-nova-vibes") {
    score += 5;
  }
  if (lower.includes("live") && item.id === "sandblast-main-radio") {
    score += 3;
  }

  // Baseline priority
  score += item.priority || 0;

  return score;
}

function findBestMatches(userMessage) {
  const text = userMessage || "";
  const active = musicDirectory.filter((item) => item.status === "active");

  const scored = active
    .map((item) => ({
      item,
      score: scoreMatch(text, item)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((entry) => entry.item);
}

function getMusicResponse(userMessage) {
  const matches = findBestMatches(userMessage);

  // No strong match – ask a clarifying question but still be helpful
  if (!matches.length) {
    return {
      category: "music_radio",
      message:
        "I’ve got a few different Sandblast Radio options. Are you looking for gospel, the main live radio stream, or DJ Nova mixes?",
      options: [
        { id: "gospel-sunday-live", label: "Gospel Sunday" },
        { id: "sandblast-main-radio", label: "Main Sandblast Radio stream" },
        { id: "dj-nova-vibes", label: "DJ Nova – Vibes Session" }
      ]
    };
  }

  const primary = matches[0];
  const response = {
    category: "music_radio",
    primary: {
      id: primary.id,
      title: primary.title,
      description: primary.description,
      stream_url: primary.stream_url,
      platform: primary.platform
    }
  };

  let message = `Based on what you asked, **${primary.title}** is the best fit.\n\n${primary.description}`;

  if (primary.schedule) {
    const s = primary.schedule;
    message += `\n\nIt usually runs on ${s.daysOfWeek.join(", ")} from ${s.startTime} to ${s.endTime} (${s.timezone}).`;
  }

  message += `\n\nYou can listen here: ${primary.stream_url}`;
  response.message = message;

  // Up to 2 alternatives
  const alternatives = matches.slice(1, 3).map((item) => ({
    id: item.id,
    title: item.title,
    stream_url: item.stream_url
  }));

  if (alternatives.length) {
    response.alternatives = alternatives;
  }

  return response;
}

module.exports = { getMusicResponse };

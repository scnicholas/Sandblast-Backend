// responseModules/newsModule.js

const { newsDirectory } = require("../Data/newsDirectory");

function scoreNewsMatch(text, item) {
  let score = 0;
  const lower = (text || "").toLowerCase();

  // Keyword match
  for (const kw of item.routing_keywords || []) {
    if (lower.includes(kw.toLowerCase())) score += 5;
  }

  // Category match
  for (const cat of item.categories || []) {
    if (lower.includes(cat.toLowerCase())) score += 2;
  }

  // Priority baseline
  score += item.priority || 0;

  return score;
}

function findNewsMatches(userMessage) {
  const text = userMessage || "";
  const scored = newsDirectory
    .map((item) => ({
      item,
      score: scoreNewsMatch(text, item)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((entry) => entry.item);
}

function getNewsResponse(userMessage) {
  const matches = findNewsMatches(userMessage);

  if (!matches.length) {
    return {
      category: "news_canada",
      message:
        "You’re asking about News Canada. We feature articles on health, finance, food, safety, and lifestyle. What topic would you like to read about?",
      options: newsDirectory.map((n) => ({
        id: n.id,
        label: n.title,
        url: n.page_url
      }))
    };
  }

  const primary = matches[0];

  const response = {
    category: "news_canada",
    primaryTopic: {
      id: primary.id,
      title: primary.title,
      description: primary.description,
      url: primary.page_url
    }
  };

  let message = `Looks like you're interested in **${primary.title}**.\n\n${primary.description}\n\nYou can explore more here:\n${primary.page_url}`;

  response.message = message;

  // Provide 2 alternative sections
  const alternatives = matches.slice(1, 3).map((item) => ({
    id: item.id,
    title: item.title,
    url: item.page_url
  }));

  if (alternatives.length) {
    response.alternatives = alternatives;
  }

  return response;
}

module.exports = { getNewsResponse };

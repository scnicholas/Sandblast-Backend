// responseModules/newsModule.js

function getNewsResponse(userMessage) {
  // Later: plug into real News Canada content
  return {
    category: "news_canada",
    message:
      "You’re asking about News Canada and editorial content. Sandblast features curated news pieces and features from News Canada.",
    actions: [
      { label: "View News Canada section", url: "https://www.sandblast.channel/news-canada" }
    ]
  };
}

module.exports = { getNewsResponse };

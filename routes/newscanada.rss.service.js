const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 10000
});

const FEED_URL = process.env.NEWS_CANADA_FEED_URL;

async function fetchRSS() {
  if (!FEED_URL) {
    throw new Error("Missing NEWS_CANADA_FEED_URL");
  }

  const feed = await parser.parseURL(FEED_URL);

  const items = (feed.items || []).map((item, index) => ({
    id: item.guid || item.link || `rss-${index}`,
    title: item.title || "",
    description: item.contentSnippet || item.content || "",
    link: item.link || "",
    pubDate: item.pubDate || item.isoDate || "",
    image:
      (item.enclosure && item.enclosure.url) ||
      ""
  }));

  return {
    ok: true,
    items
  };
}

module.exports = {
  fetchRSS
};

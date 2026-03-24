const { fetchHomePage } = require("./fetchHome");
const { extractEditorsPicksLinks } = require("./fetchEditorsPicks");
const { fetchArticlePage, parseArticle } = require("./parseArticle");
const { normalizeArticle } = require("./normalizeArticle");
const { saveArticles } = require("./saveArticles");

async function runNewsCanadaEditorsPicksIngest() {
  const { html } = await fetchHomePage();
  const links = extractEditorsPicksLinks(html);

  console.log(`[NewsCanada] found ${links.length} potential Editor's Picks links`);

  const articles = [];

  for (const link of links) {
    try {
      console.log(`[NewsCanada] fetching article: ${link.url}`);

      const articleHtml = await fetchArticlePage(link.url);
      const parsed = parseArticle(articleHtml, link.url);
      const normalized = normalizeArticle(parsed);

      if (!normalized.title || !normalized.url) {
        console.warn(`[NewsCanada] skipped invalid article: ${link.url}`);
        continue;
      }

      if (!normalized.body || normalized.body.length < 80) {
        console.warn(`[NewsCanada] skipped thin-content article: ${link.url}`);
        continue;
      }

      articles.push(normalized);
    } catch (error) {
      console.error(`[NewsCanada] failed article: ${link.url}`);
      console.error(error.message);
    }
  }

  const outFile = saveArticles(articles);

  console.log(`[NewsCanada] saved ${articles.length} articles to ${outFile}`);

  return {
    count: articles.length,
    outFile,
    articles
  };
}

if (require.main === module) {
  runNewsCanadaEditorsPicksIngest()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("[NewsCanada] ingest failed");
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  runNewsCanadaEditorsPicksIngest
};

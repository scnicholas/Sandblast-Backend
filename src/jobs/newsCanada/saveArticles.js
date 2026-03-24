const fs = require("fs");
const path = require("path");

function saveArticles(articles) {
  const outDir = path.join(process.cwd(), "data", "newscanada");
  const outFile = path.join(outDir, "editors-picks.json");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(articles, null, 2), "utf8");

  return outFile;
}

module.exports = { saveArticles };

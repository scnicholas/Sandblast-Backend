const path = require("path");
const { NEWS_CANADA_CONFIG } = require("./config");
const { ensureDir, writeJson } = require("./utils");

function saveArticles(payload) {
  ensureDir(NEWS_CANADA_CONFIG.outputDir);
  const outFile = path.join(NEWS_CANADA_CONFIG.outputDir, NEWS_CANADA_CONFIG.outputFile);
  writeJson(outFile, payload);
  return outFile;
}

module.exports = { saveArticles };

const fs = require("fs");
const path = require("path");
const { NEWS_CANADA_CONFIG } = require("./config");
const { ensureDir, writeJson } = require("./utils");

function buildPayloadEnvelope(payload) {
  const articles = Array.isArray(payload) ? payload : Array.isArray(payload?.articles) ? payload.articles : [];

  return Array.isArray(payload)
    ? {
        source: "News Canada",
        generatedAt: new Date().toISOString(),
        count: articles.length,
        articles
      }
    : {
        ...(payload && typeof payload === "object" ? payload : {}),
        source: (payload && payload.source) || "News Canada",
        generatedAt: new Date().toISOString(),
        count: articles.length,
        articles
      };
}

function saveArticles(payload) {
  ensureDir(NEWS_CANADA_CONFIG.outputDir);

  const outFile = path.join(NEWS_CANADA_CONFIG.outputDir, NEWS_CANADA_CONFIG.outputFile);
  const tmpFile = `${outFile}.tmp`;
  const envelope = buildPayloadEnvelope(payload);

  writeJson(tmpFile, envelope);
  fs.renameSync(tmpFile, outFile);

  return outFile;
}

module.exports = { saveArticles };

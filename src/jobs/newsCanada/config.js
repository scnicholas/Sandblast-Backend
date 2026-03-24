const path = require("path");

const NEWS_CANADA_CONFIG = {
  homeUrl: "https://www.newscanada.com/home",
  baseUrl: "https://www.newscanada.com",
  userAgent: "SandblastNewsBot/2.0 (+https://sandblast.channel)",
  timeoutMs: 20000,
  retries: 3,
  retryDelayMs: 1200,
  maxEditorsPickLinks: 24,
  maxBodyNodesToScan: 1200,
  minBodyLength: 120,
  outputDir: path.join(process.cwd(), "data", "newscanada"),
  snapshotDir: path.join(process.cwd(), "data", "newscanada", "snapshots"),
  outputFile: "editors-picks.v2.json",
  logPrefix: "[NewsCanadaV2]"
};

module.exports = { NEWS_CANADA_CONFIG };

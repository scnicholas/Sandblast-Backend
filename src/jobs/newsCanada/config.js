const path = require("path");

const BASE_URL = "https://www.newscanada.com";
const HOME_PATH = "/home";
const HOME_URL = new URL(HOME_PATH, BASE_URL).toString();

const DATA_DIR = path.resolve(__dirname, "data", "newscanada");
const SNAPSHOT_DIR = path.resolve(DATA_DIR, "snapshots");

const NEWS_CANADA_CONFIG = {
  baseUrl: BASE_URL,
  baseURL: BASE_URL,
  homePath: HOME_PATH,
  homeUrl: HOME_URL,
  homeURL: HOME_URL,
  editorsPicksUrl: HOME_URL,
  editorsPicksURL: HOME_URL,
  userAgent: "SandblastNewsBot/2.0 (+https://sandblast.channel)",
  timeoutMs: 20000,
  retries: 3,
  retryDelayMs: 1200,
  maxEditorsPickLinks: 24,
  maxBodyNodesToScan: 1200,
  minBodyLength: 120,
  outputDir: DATA_DIR,
  snapshotDir: SNAPSHOT_DIR,
  outputFile: "editors-picks.v2.json",
  logPrefix: "[NewsCanadaV2]"
};

module.exports = { NEWS_CANADA_CONFIG };

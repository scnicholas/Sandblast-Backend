const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMultilineText(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean)
    .join("\n\n");
}

function hashString(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toAbsoluteUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return "";
  }
}

function isLikelyArticleUrl(url) {
  return /^https:\/\/www\.newscanada\.com\/[a-z]{2}\/.+/.test(String(url || ""));
}

function summarize(text, maxLength = 260) {
  const clean = cleanText(text);
  if (!clean) return "";
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength).replace(/\s+\S*$/, "") + "...";
}

function safeFileName(value, max = 80) {
  const base = String(value || "file")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);

  return base || "file";
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

module.exports = {
  sleep,
  cleanText,
  cleanMultilineText,
  hashString,
  ensureDir,
  toAbsoluteUrl,
  isLikelyArticleUrl,
  summarize,
  safeFileName,
  writeJson
};

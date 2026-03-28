const fs = require("fs");
const path = require("path");
const { ensureDir, safeFileName, hashString } = require("./utils");

function saveHtmlSnapshot({ snapshotDir, label, url, html }) {
  const safeDir = snapshotDir || path.join(__dirname, "data", "newscanada", "snapshots");
  ensureDir(safeDir);

  const fileName = `${safeFileName(label || "home")}-${hashString(url || "https://www.newscanada.com/home").slice(0, 10)}.html`;
  const filePath = path.join(safeDir, fileName);

  fs.writeFileSync(filePath, String(html || ""), "utf8");
  return filePath;
}

module.exports = { saveHtmlSnapshot };

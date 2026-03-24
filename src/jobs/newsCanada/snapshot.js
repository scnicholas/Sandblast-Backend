const fs = require("fs");
const path = require("path");
const { ensureDir, safeFileName, hashString } = require("./utils");

function saveHtmlSnapshot({ snapshotDir, label, url, html }) {
  ensureDir(snapshotDir);

  const fileName = `${safeFileName(label)}-${hashString(url).slice(0, 10)}.html`;
  const filePath = path.join(snapshotDir, fileName);

  fs.writeFileSync(filePath, html, "utf8");
  return filePath;
}

module.exports = { saveHtmlSnapshot };

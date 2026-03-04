const fs = require("fs");
const path = require("path");

const datasetPath = path.join(__dirname, "datasets", "knowledge.json");

let knowledge = [];

function loadDataset() {
  try {
    const raw = fs.readFileSync(datasetPath, "utf8");
    knowledge = JSON.parse(raw);
    console.log("Dataset loaded:", knowledge.length, "entries");
  } catch (err) {
    console.error("Dataset load failed:", err.message);
  }
}

function searchDataset(query) {
  if (!query) return null;

  const q = query.toLowerCase();

  const match = knowledge.find(entry =>
    entry.question.toLowerCase().includes(q) ||
    entry.topic.toLowerCase().includes(q)
  );

  return match || null;
}

module.exports = {
  loadDataset,
  searchDataset
};

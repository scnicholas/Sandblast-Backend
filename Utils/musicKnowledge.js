function loadDb() {
  if (CACHE) return CACHE;

  const p1 = path.join(__dirname, "..", "Data", "music_moments_v1.json");
  const p2 = path.join(__dirname, "..", "Data", "music_moments_v2.json");

  const db1 = fs.existsSync(p1) ? JSON.parse(fs.readFileSync(p1, "utf8")) : { moments: [] };
  const db2 = fs.existsSync(p2) ? JSON.parse(fs.readFileSync(p2, "utf8")) : { moments: [] };

  const all = [...(db1.moments || []), ...(db2.moments || [])];

  // De-dupe by artist+title+year+chart
  const seen = new Set();
  const merged = [];
  for (const m of all) {
    const key =
      `${normalize(m.artist)}|${normalize(m.title)}|${m.year || ""}|${(m.chart || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(m);
  }

  CACHE = { moments: merged };
  return CACHE;
}

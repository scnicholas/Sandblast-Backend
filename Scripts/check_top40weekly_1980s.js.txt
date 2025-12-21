const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "data", "top40weekly");
const years = [1980,1981,1982,1983,1984,1985,1986,1987,1988,1989];

for (const y of years) {
  const p = path.join(dir, `top100_${y}.json`);
  if (!fs.existsSync(p)) {
    console.log(y, "MISSING FILE");
    continue;
  }

  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  const ranks = data.map(x => x.rank).filter(Boolean);

  const missing = [];
  for (let r = 1; r <= 100; r++) {
    if (!ranks.includes(r)) missing.push(r);
  }

  console.log(
    y,
    "rows:", data.length,
    "missingRanks:", missing.length ? missing.join(",") : "(none)"
  );
}

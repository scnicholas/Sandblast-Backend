"use strict";

const fs = require("fs");

const SOURCE_URL = "https://top40weekly.com/top-100-songs-of-the-1990s/";

(async function () {
  const res = await fetch(SOURCE_URL);
  const html = await res.text();

  const start = html.indexOf('id="1990-topsongslist"');
  const end = html.indexOf('id="1991-topsongslist"', start);

  if (start === -1 || end === -1) {
    console.error("1990 section not found");
    process.exit(1);
  }

  const section = html.slice(start, end);

  fs.writeFileSync(
    "scripts/1990_section_raw.html",
    section,
    "utf8"
  );

  console.log("Wrote scripts/1990_section_raw.html");
})();

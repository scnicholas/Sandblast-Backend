const kb = require("../Utils/musicKnowledge");
const top = kb.getTopByYear(1994, 10, "Top40Weekly Top 100");
top.forEach((m, i) => console.log(`${i + 1}. ${m.artist} - "${m.title}"`));

newsCanada-v2 hardened folder

Files:
- config.js
- logger.js
- utils.js
- http.js
- snapshot.js
- fetchHome.js
- fetchEditorsPicks.js
- parseArticle.js
- normalizeArticle.js
- validateArticle.js
- saveArticles.js
- index.js

Install:
npm install axios cheerio

Run:
node src/jobs/newsCanada/index.js

Notes:
- retries enabled
- homepage and article HTML snapshots saved
- duplicate protection enabled
- thin / invalid article filtering enabled
- output written to data/newscanada/editors-picks.v2.json

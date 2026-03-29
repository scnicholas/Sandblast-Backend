// runtime/newsCanadaRuntime.js
const fs = require('fs');
const path = require('path');

const TRACE_PREFIX = '[Sandblast][NewsCanada]';

function log(stage, payload = {}) {
  try {
    console.log(`${TRACE_PREFIX} ${stage}`, payload);
  } catch (_) {
    console.log(`${TRACE_PREFIX} ${stage}`);
  }
}

function normalizeStory(raw = {}, index = 0) {
  const id =
    raw.id ||
    raw.slug ||
    raw.storyId ||
    `news-canada-${index + 1}`;

  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : 'Untitled Story';

  const summary =
    typeof raw.summary === 'string' && raw.summary.trim()
      ? raw.summary.trim()
      : '';

  const body =
    typeof raw.body === 'string' && raw.body.trim()
      ? raw.body.trim()
      : summary || '';

  const url =
    typeof raw.url === 'string' && raw.url.trim()
      ? raw.url.trim()
      : 'https://www.newscanada.com/home';

  const image =
    typeof raw.image === 'string' && raw.image.trim()
      ? raw.image.trim()
      : '';

  const issue =
    typeof raw.issue === 'string' && raw.issue.trim()
      ? raw.issue.trim()
      : 'Editor’s Pick';

  const categories = Array.isArray(raw.categories)
    ? raw.categories.filter(Boolean)
    : ['Canada', 'News'];

  const publishedAt =
    typeof raw.publishedAt === 'string' && raw.publishedAt.trim()
      ? raw.publishedAt.trim()
      : new Date().toISOString();

  return {
    id,
    title,
    summary,
    body,
    url,
    image,
    issue,
    categories,
    publishedAt
  };
}

function getFallbackStories() {
  return [
    normalizeStory({
      id: 'fallback-news-canada-1',
      title: 'News Canada Feature One',
      summary:
        'Fallback editor’s pick payload so the carousel stays visible while upstream feed work is stabilized.',
      body:
        'This fallback story keeps the Sandblast News Canada surface alive while the upstream feed is being refreshed. The pipeline expects a stable full-story contract rather than a thin payload.',
      url: 'https://www.newscanada.com/home',
      issue: 'Editor’s Pick',
      categories: ['Canada', 'News']
    }, 0),
    normalizeStory({
      id: 'fallback-news-canada-2',
      title: 'News Canada Feature Two',
      summary:
        'This controller preserves a clean frontend contract by always returning an array of usable story objects.',
      body:
        'The News Canada runtime now guarantees a readable editors-picks file and a usable fallback so the frontend does not collapse when upstream content is temporarily unavailable.',
      url: 'https://www.newscanada.com/home',
      issue: 'Top Story',
      categories: ['Features', 'Editorial']
    }, 1)
  ];
}

function resolveProjectRoot() {
  const cwd = process.cwd();
  const candidates = [
    cwd,
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '../..')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return cwd;
}

function resolveNewsCanadaPaths() {
  const root = resolveProjectRoot();

  const dataDirCandidates = [
    path.join(root, 'data', 'NewsCanada'),
    path.join(root, 'data', 'newscanada'),
    path.join(root, 'src', 'data', 'NewsCanada'),
    path.join(root, 'src', 'data', 'newscanada'),
    path.join(root, 'jobs', 'newsCanada', 'data', 'NewsCanada'),
    path.join(root, 'jobs', 'newsCanada', 'data', 'newscanada')
  ];

  let chosenDir = dataDirCandidates[0];

  for (const dir of dataDirCandidates) {
    if (fs.existsSync(dir)) {
      chosenDir = dir;
      break;
    }
  }

  const editorsPicksPath = path.join(chosenDir, 'editors-picks.v2.json');

  return {
    root,
    chosenDir,
    editorsPicksPath,
    candidates: dataDirCandidates
  };
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log('directory_created', { dirPath });
  }
}

function safeReadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function safeWriteJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function ensureEditorsPicksFile() {
  const paths = resolveNewsCanadaPaths();

  log('resolver_boot', {
    root: paths.root,
    chosenDir: paths.chosenDir,
    editorsPicksPath: paths.editorsPicksPath,
    candidates: paths.candidates
  });

  ensureDirectory(paths.chosenDir);

  if (!fs.existsSync(paths.editorsPicksPath)) {
    const fallbackStories = getFallbackStories();
    safeWriteJson(paths.editorsPicksPath, fallbackStories);
    log('fallback_file_created', {
      editorsPicksPath: paths.editorsPicksPath,
      stories: fallbackStories.length
    });
  }

  return paths;
}

function readEditorsPicks() {
  const { editorsPicksPath } = ensureEditorsPicksFile();

  try {
    const parsed = safeReadJson(editorsPicksPath);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.stories)
        ? parsed.stories
        : [];

    const normalized = list.map(normalizeStory).filter(Boolean);

    log('read_success', {
      editorsPicksPath,
      count: normalized.length,
      firstStory: normalized[0]
        ? { id: normalized[0].id, title: normalized[0].title }
        : null
    });

    if (!normalized.length) {
      const fallbackStories = getFallbackStories();
      safeWriteJson(editorsPicksPath, fallbackStories);
      log('read_empty_repaired_with_fallback', {
        editorsPicksPath,
        stories: fallbackStories.length
      });
      return fallbackStories;
    }

    return normalized;
  } catch (error) {
    log('read_failure', {
      editorsPicksPath,
      error: error.message
    });

    const fallbackStories = getFallbackStories();
    safeWriteJson(editorsPicksPath, fallbackStories);

    log('read_failure_repaired_with_fallback', {
      editorsPicksPath,
      stories: fallbackStories.length
    });

    return fallbackStories;
  }
}

function writeEditorsPicks(stories = [], meta = {}) {
  const { editorsPicksPath } = ensureEditorsPicksFile();

  const normalized = Array.isArray(stories)
    ? stories.map(normalizeStory).filter(Boolean)
    : [];

  const payload = normalized.length ? normalized : getFallbackStories();

  safeWriteJson(editorsPicksPath, payload);

  log('write_success', {
    editorsPicksPath,
    count: payload.length,
    source: meta.source || 'unknown',
    firstStory: payload[0]
      ? { id: payload[0].id, title: payload[0].title }
      : null
  });

  return payload;
}

function traceLifecycle(stage, payload = {}) {
  log(`trace_${stage}`, payload);
}

module.exports = {
  resolveNewsCanadaPaths,
  ensureEditorsPicksFile,
  readEditorsPicks,
  writeEditorsPicks,
  traceLifecycle,
  getFallbackStories,
  normalizeStory
};

const cheerio = require("cheerio");
const { NEWS_CANADA_CONFIG } = require("./config");
const { cleanText, toAbsoluteUrl, isLikelyArticleUrl } = require("./utils");

const NEGATIVE_TITLE_RE = /^(read more|more|click here|learn more|view|image view|about us|contact us|privacy|privacy policy|terms|terms of use|subscribe|sign up|newsletter|content solutions|media attachments|related posts)$/i;
const NEGATIVE_CONTEXT_RE = /(contact|privacy|terms|about|subscribe|sign up|newsletter|content solutions|media attachments|related posts|copyright|all rights reserved)/i;
const NEGATIVE_PATH_RE = /\/(about(?:-us)?|contact(?:-us)?|privacy(?:-policy)?|terms(?:-of-use)?|subscribe|signup|sign-up|newsletter|content-solutions|media(?:-attachments)?|related-posts?)(?:[/?#]|$)/i;
const LISTING_PATH_RE = /\/(home|editor-picks(?:\/content)?)(?:[/?#]|$)/i;
const SECTION_LANDING_PATH_RE = /\/(?:[a-z]{2}\/)?[a-z0-9-]+\/content(?:[/?#]|$)/i;
const EDITORS_PICKS_RE = /editor'?s picks/i;
const FEATURED_CONTENT_RE = /featured content/i;
const CURRENTLY_ONLINE_RE = /currently online/i;
const SURFACE_HEADING_RE = /(editor'?s picks|featured content|currently online)/i;
const STRONG_ARTICLE_PATH_RE = /\/(?:[a-z]{2}\/)?(?:[^/?#]*-[0-9]{4,}|[a-z0-9-]{24,}|[a-z0-9-]+\/[a-z0-9-]{24,})(?:[/?#]|$)/i;
const MODERATE_ARTICLE_PATH_RE = /\/(?:[a-z]{2}\/)?(?:[a-z0-9-]{16,}|[a-z0-9-]+\/[a-z0-9-]{16,})(?:[/?#]|$)/i;
const NEGATIVE_ANCHOR_CONTEXT_RE = /(footer|header|navigation|menu|breadcrumb|social|follow us|share|copyright|all rights reserved)/i;
const GENERIC_SECTION_TITLE_RE = /^(fraud\s*&\s*cybersecurity|health|finance|travel|family|food|business|lifestyle|technology|news canada content solutions)$/i;
const SOFT_NEGATIVE_CONTEXT_RE = /(footer|header|navigation|menu|breadcrumb|social|follow us|share)/i;
const HARD_NEGATIVE_TITLE_KEYWORDS_RE = /(about|contact|privacy|terms|subscribe|newsletter|content solutions|media attachments|related posts)/i;

function normalizeUrl(url) {
  if (!url) return "";
  return String(url).trim().replace(/#.*$/, "");
}

function createStats() {
  return {
    headingsMatched: 0,
    fallbackUsed: false,
    candidatesSeen: 0,
    candidatesAccepted: 0,
    rescuedCandidates: 0,
    pathShapeSoftAccepted: 0,
    rejected: {
      missingTitleOrUrl: 0,
      negativeTitle: 0,
      unlikelyArticleUrl: 0,
      invalidUrl: 0,
      negativeOrListingPath: 0,
      sectionLandingPath: 0,
      weakUrlShape: 0,
      negativeContext: 0,
      negativeAnchorContext: 0,
      lowScore: 0
    },
    scoreHistogram: {
      gte12: 0,
      gte10: 0,
      gte8: 0,
      lt8: 0
    },
    samples: {
      accepted: [],
      rejected: [],
      lowScore: [],
      rescued: []
    }
  };
}

function pushSample(bucket, value, limit = 15) {
  if (!Array.isArray(bucket) || bucket.length >= limit) return;
  bucket.push(value);
}

function sampleText(value, max = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function recordAcceptedSample(stats, detail) {
  if (!stats?.samples?.accepted) return;
  pushSample(stats.samples.accepted, {
    title: sampleText(detail.title, 140),
    url: detail.url,
    score: detail.score,
    surfaceLabel: detail.surfaceLabel || "",
    withinEditorsPicks: Boolean(detail.withinEditorsPicks),
    context: sampleText(detail.context, 180)
  });
}

function recordRejectedSample(stats, detail) {
  if (!stats?.samples?.rejected) return;
  pushSample(stats.samples.rejected, {
    reason: detail.reason,
    title: sampleText(detail.title, 140),
    url: detail.url || "",
    allowSoftPass: Boolean(detail.allowSoftPass),
    context: sampleText(detail.contextText, 180),
    anchorContext: sampleText(detail.anchorContextText, 140),
    pathname: detail.urlInfo?.pathname || ""
  });
}

function recordLowScoreSample(stats, detail) {
  if (!stats?.samples?.lowScore) return;
  pushSample(stats.samples.lowScore, {
    title: sampleText(detail.title, 140),
    url: detail.url,
    score: detail.score,
    surfaceLabel: detail.surfaceLabel || "",
    context: sampleText(detail.context, 180)
  });
}

function recordRescuedSample(stats, detail) {
  if (!stats?.samples?.rescued) return;
  pushSample(stats.samples.rescued, {
    title: sampleText(detail.title, 140),
    url: detail.url,
    score: detail.score,
    surfaceLabel: detail.surfaceLabel || "",
    withinEditorsPicks: Boolean(detail.withinEditorsPicks)
  });
}

function bump(stats, key) {
  if (!stats || !stats.rejected) return;
  stats.rejected[key] = (stats.rejected[key] || 0) + 1;
}

function noteScore(stats, score) {
  if (!stats || !stats.scoreHistogram) return;
  if (score >= 12) stats.scoreHistogram.gte12 += 1;
  else if (score >= 10) stats.scoreHistogram.gte10 += 1;
  else if (score >= 8) stats.scoreHistogram.gte8 += 1;
  else stats.scoreHistogram.lt8 += 1;
}

function getHeadingText($, node) {
  const own = cleanText($(node).text());
  if (own) return own;

  const previousHeading = $(node).prevAll("h1,h2,h3,h4,strong").first();
  return cleanText(previousHeading.text());
}

function getSurfaceLabel(text) {
  const clean = cleanText(text).toLowerCase();
  if (EDITORS_PICKS_RE.test(clean)) return "editors-picks";
  if (FEATURED_CONTENT_RE.test(clean)) return "featured-content";
  if (CURRENTLY_ONLINE_RE.test(clean)) return "currently-online";
  return "";
}

function getAnchorTitle($, a) {
  return (
    cleanText($(a).text()) ||
    cleanText($(a).attr("title")) ||
    cleanText($(a).attr("aria-label")) ||
    cleanText($(a).find("img").attr("alt"))
  );
}

function isCategoryListingUrl(url) {
  const clean = String(url || "").trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    return SECTION_LANDING_PATH_RE.test(parsed.pathname || "");
  } catch {
    return false;
  }
}

function isHomeListingUrl(url) {
  const clean = String(url || "").trim();
  if (!clean) return false;
  try {
    const parsed = new URL(clean);
    return /\/home(?:[/?#]|$)/i.test(parsed.pathname || "");
  } catch {
    return false;
  }
}

function inspectUrlShape(url) {
  if (!url) {
    return {
      valid: false,
      strong: false,
      moderate: false,
      listing: false,
      negative: false,
      sectionLanding: false,
      sameHost: false,
      pathname: ""
    };
  }

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || "";
    const sameHost = /(^|\.)newscanada\.com$/i.test(parsed.hostname);
    const negative = NEGATIVE_PATH_RE.test(pathname);
    const listing = LISTING_PATH_RE.test(pathname);
    const sectionLanding = SECTION_LANDING_PATH_RE.test(pathname);
    const strong = STRONG_ARTICLE_PATH_RE.test(pathname);
    const moderate = MODERATE_ARTICLE_PATH_RE.test(pathname);

    return {
      valid: /^https?:$/i.test(parsed.protocol) && sameHost && !negative,
      strong,
      moderate,
      listing,
      negative,
      sectionLanding,
      sameHost,
      pathname
    };
  } catch {
    return {
      valid: false,
      strong: false,
      moderate: false,
      listing: false,
      negative: false,
      sectionLanding: false,
      sameHost: false,
      pathname: ""
    };
  }
}

function hasNegativeTitle(title, urlInfo) {
  const text = String(title || "").trim();
  if (!text) return true;
  if (NEGATIVE_TITLE_RE.test(text)) return true;
  if (HARD_NEGATIVE_TITLE_KEYWORDS_RE.test(text)) return true;
  if (text.length < 8 && !(urlInfo?.strong || urlInfo?.moderate)) return true;
  return false;
}

function scoreCandidate(title, containerText, anchorText, href, options = {}) {
  let score = 0;
  const titleLc = String(title || "").toLowerCase();
  const containerLc = String(containerText || "").toLowerCase();
  const anchorLc = String(anchorText || "").toLowerCase();
  const hrefLc = String(href || "").toLowerCase();
  const urlInfo = inspectUrlShape(href);
  const withinEditorsPicks = !!options.withinEditorsPicks;
  const categoryListing = !!options.categoryListing;
  const homeListing = !!options.homeListing;
  const surfaceLabel = String(options.surfaceLabel || "");

  if (withinEditorsPicks) score += 4;
  if (categoryListing) score += 3;
  if (homeListing) score += 2;
  if (EDITORS_PICKS_RE.test(containerLc)) score += 8;
  if (FEATURED_CONTENT_RE.test(containerLc)) score += 5;
  if (CURRENTLY_ONLINE_RE.test(containerLc)) score += 2;
  if (surfaceLabel === "featured-content") score += 3;
  if (surfaceLabel === "currently-online") score += 1;
  if (anchorLc && anchorLc === titleLc) score += 1;
  if (title.length >= 20) score += 2;
  if (!hasNegativeTitle(title, urlInfo)) score += 2;
  if (!NEGATIVE_CONTEXT_RE.test(titleLc) && !NEGATIVE_CONTEXT_RE.test(containerLc)) score += 2;
  if (urlInfo.strong) score += 6;
  else if (urlInfo.moderate) score += 3;
  if (/\b(news|canada|health|finance|food|travel|family|market|study|report|launch|guide|tips|new|technology|recipe|business|fraud|cybersecurity|upcoming|seniors|parents|vision|smiles|tax)\b/i.test(title)) score += 1;
  if (anchorLc && anchorLc.includes("read more")) score -= 2;
  if (SOFT_NEGATIVE_CONTEXT_RE.test(containerLc)) score -= 2;
  if (NEGATIVE_CONTEXT_RE.test(containerLc)) score -= 3;
  if (NEGATIVE_ANCHOR_CONTEXT_RE.test(anchorLc)) score -= 2;
  if (urlInfo.listing) score -= 4;
  if (urlInfo.sectionLanding) score -= 8;
  if (urlInfo.negative) score -= 8;
  if (hrefLc.includes("/en/")) score += 1;
  if (GENERIC_SECTION_TITLE_RE.test(String(title || "").trim())) score -= 2;

  return score;
}

function rejectCandidate(stats, reason, detail) {
  bump(stats, reason);
  recordRejectedSample(stats, { ...detail, reason });
  return { rejected: true, reason };
}

function shouldRejectCandidate({ title, url, contextText, anchorContextText, stats, allowSoftPass, categoryListing, homeListing }) {
  stats && (stats.candidatesSeen += 1);

  if (!title || !url) {
    return rejectCandidate(stats, "missingTitleOrUrl", { title, url, contextText, anchorContextText, allowSoftPass });
  }

  const urlInfo = inspectUrlShape(url);
  const likelyArticle = isLikelyArticleUrl(url);
  const shapeLooksArticleLike = urlInfo.strong || urlInfo.moderate;

  if (hasNegativeTitle(title, urlInfo)) {
    return rejectCandidate(stats, "negativeTitle", { title, url, contextText, anchorContextText, allowSoftPass, urlInfo });
  }
  if (!likelyArticle && !shapeLooksArticleLike) {
    return rejectCandidate(stats, "unlikelyArticleUrl", { title, url, contextText, anchorContextText, allowSoftPass, urlInfo });
  }
  if (!urlInfo.valid) {
    return rejectCandidate(stats, "invalidUrl", { title, url, contextText, anchorContextText, allowSoftPass, urlInfo });
  }
  if (urlInfo.negative || urlInfo.listing) {
    return rejectCandidate(stats, "negativeOrListingPath", { title, url, contextText, anchorContextText, allowSoftPass, urlInfo });
  }
  if (urlInfo.sectionLanding) {
    return rejectCandidate(stats, "sectionLandingPath", { title, url, contextText, anchorContextText, allowSoftPass, urlInfo });
  }
  if (!likelyArticle && shapeLooksArticleLike && stats) {
    stats.pathShapeSoftAccepted += 1;
  }
  if (!allowSoftPass && !categoryListing && !homeListing && !urlInfo.strong && !urlInfo.moderate) {
    const looksArticleLike = String(title || "").trim().length >= 18 && !NEGATIVE_CONTEXT_RE.test(String(contextText || "").toLowerCase());
    if (!looksArticleLike) {
      return rejectCandidate(stats, "weakUrlShape", { title, url, contextText, anchorContextText, allowSoftPass, urlInfo });
    }
  }

  const titleLc = String(title).toLowerCase();
  const contextLc = String(contextText || "").toLowerCase();
  const anchorContextLc = String(anchorContextText || "").toLowerCase();
  if (NEGATIVE_CONTEXT_RE.test(titleLc)) {
    return rejectCandidate(stats, "negativeContext", { title, url, contextText, anchorContextText, allowSoftPass, urlInfo });
  }
  if (NEGATIVE_CONTEXT_RE.test(contextLc) && !SURFACE_HEADING_RE.test(contextLc) && !categoryListing && !homeListing) {
    return rejectCandidate(stats, "negativeContext", { title, url, contextText, anchorContextText, allowSoftPass, urlInfo });
  }
  if (NEGATIVE_ANCHOR_CONTEXT_RE.test(anchorContextLc) && !allowSoftPass && !categoryListing && !homeListing) {
    return rejectCandidate(stats, "negativeAnchorContext", { title, url, contextText, anchorContextText, allowSoftPass, urlInfo });
  }

  return { rejected: false, reason: "" };
}

function pushCandidate($, a, contextText, items, stats, options = {}) {
  const title = getAnchorTitle($, a);
  const href = cleanText($(a).attr("href"));
  const rawUrl = toAbsoluteUrl(href, NEWS_CANADA_CONFIG.baseUrl || NEWS_CANADA_CONFIG.baseURL);
  const url = normalizeUrl(rawUrl);
  const anchorContextText = cleanText($(a).parent().text());
  const withinEditorsPicks = !!options.withinEditorsPicks;
  const categoryListing = !!options.categoryListing;
  const homeListing = !!options.homeListing;
  const allowSoftPass = withinEditorsPicks || categoryListing || homeListing;
  const surfaceLabel = String(options.surfaceLabel || "");

  const rejection = shouldRejectCandidate({ title, url, contextText, anchorContextText, stats, allowSoftPass, categoryListing, homeListing });
  if (rejection.rejected) return;

  const score = scoreCandidate(title, contextText, cleanText($(a).text()), url, { withinEditorsPicks, categoryListing, homeListing, surfaceLabel });
  noteScore(stats, score);

  const acceptedItem = {
    title,
    url,
    score,
    context: String(contextText || "").slice(0, 400),
    withinEditorsPicks,
    allowSoftPass,
    categoryListing,
    homeListing,
    surfaceLabel
  };

  items.push(acceptedItem);
  if (stats) {
    stats.candidatesAccepted += 1;
    recordAcceptedSample(stats, acceptedItem);
  }
}

function collectAnchorsFromContainer($, container, items, stats, options = {}) {
  if (!container || !container.length) return;

  const anchors = $(container).find("a");
  if (anchors.length === 0 || anchors.length > 48) return;

  const contextText = cleanText($(container).text());
  if (
    !options.withinEditorsPicks &&
    !options.categoryListing &&
    !options.homeListing &&
    !SURFACE_HEADING_RE.test(contextText) &&
    anchors.length > 16
  ) {
    return;
  }

  anchors.each((_, a) => pushCandidate($, a, contextText, items, stats, options));
}

function collectDirectEditorsPicksCandidates($, el, items, stats, options = {}) {
  const headingScope = getHeadingText($, el);
  const section = $(el).closest("section, article, div, main");
  const containers = [$(el).parent(), section];
  const surfaceLabel = options.surfaceLabel || getSurfaceLabel(headingScope);

  containers.forEach((container) => {
    if (!container || !container.length) return;
    collectAnchorsFromContainer($, container, items, stats, {
      withinEditorsPicks: surfaceLabel === "editors-picks",
      categoryListing: !!options.categoryListing,
      homeListing: !!options.homeListing,
      surfaceLabel
    });

    container.find("a").each((_, a) => {
      const contextualText = `${headingScope} ${cleanText($(a).closest("li,article,div").text())}`.trim();
      pushCandidate($, a, contextualText, items, stats, {
        withinEditorsPicks: surfaceLabel === "editors-picks",
        categoryListing: !!options.categoryListing,
        homeListing: !!options.homeListing,
        surfaceLabel
      });
    });
  });
}

function collectAroundHeading($, el, items, stats, options = {}) {
  const headingScope = getHeadingText($, el);
  const parent = $(el).parent();
  const section = $(el).closest("section, article, div, main");
  const surfaceLabel = options.surfaceLabel || getSurfaceLabel(headingScope);

  collectAnchorsFromContainer($, parent, items, stats, options);
  collectAnchorsFromContainer($, section, items, stats, options);
  collectDirectEditorsPicksCandidates($, el, items, stats, { ...options, surfaceLabel });

  let cursor = $(el).next();
  let hops = 0;
  while (cursor.length && hops < 12) {
    if (cursor.is("h1,h2,h3,h4") && !SURFACE_HEADING_RE.test(cleanText(cursor.text()))) break;
    const blockText = `${headingScope} ${cleanText(cursor.text())}`.trim();
    const anchorCount = cursor.find("a").length;
    if (anchorCount > 0 && anchorCount <= 24) {
      cursor.find("a").each((_, a) => {
        pushCandidate($, a, blockText, items, stats, {
          withinEditorsPicks: surfaceLabel === "editors-picks" || EDITORS_PICKS_RE.test(blockText),
          categoryListing: !!options.categoryListing,
          homeListing: !!options.homeListing,
          surfaceLabel: surfaceLabel || getSurfaceLabel(blockText)
        });
      });
    }
    cursor = cursor.next();
    hops += 1;
  }
}

function collectCategoryListingCandidates($, items, stats, options = {}) {
  const selectors = [
    "article",
    ".views-row",
    ".view-content .views-row",
    ".node",
    ".card",
    ".content",
    "main a"
  ];

  const seenContainers = new Set();

  selectors.forEach((selector) => {
    $(selector).each((index, el) => {
      const key = `${selector}:${index}`;
      if (seenContainers.has(key)) return;
      seenContainers.add(key);

      const container = $(el);
      const contextText = cleanText(container.text());
      const anchors = container.is("a") ? container : container.find("a");
      if (!anchors.length || anchors.length > 24) return;
      if (!contextText) return;

      anchors.each((__, a) => {
        pushCandidate($, a, contextText, items, stats, options);
      });
    });
  });

  $("a").each((_, a) => {
    const container = $(a).closest("article, li, .views-row, .node, .card, .item, .teaser, .content");
    const contextText = cleanText(container.text()) || cleanText($(a).parent().text()) || cleanText($(a).text());
    if (!contextText) return;
    pushCandidate($, a, contextText, items, stats, options);
  });
}

function collectPageFallback($, items, stats, options = {}) {
  $("a").each((_, a) => {
    const title = getAnchorTitle($, a);
    const href = cleanText($(a).attr("href"));
    const url = normalizeUrl(
      toAbsoluteUrl(href, NEWS_CANADA_CONFIG.baseUrl || NEWS_CANADA_CONFIG.baseURL)
    );
    const parentText = cleanText($(a).parent().text());
    const grandParentText = cleanText($(a).parent().parent().text());
    const context = `${parentText} ${grandParentText}`.trim();
    const categoryListing = !!options.categoryListing;
    const homeListing = !!options.homeListing;
    const surfaceLabel = options.surfaceLabel || getSurfaceLabel(context);

    if (!context) return;
    const rejection = shouldRejectCandidate({
      title,
      url,
      contextText: context,
      anchorContextText: parentText,
      stats,
      allowSoftPass: categoryListing || homeListing,
      categoryListing,
      homeListing
    });
    if (rejection.rejected) return;

    const score = scoreCandidate(title, context, cleanText($(a).text()), url, { categoryListing, homeListing, surfaceLabel });
    noteScore(stats, score);
    const minScore = categoryListing || homeListing ? 6 : 7;
    if (score < minScore) {
      bump(stats, "lowScore");
      recordLowScoreSample(stats, { title, url, score, context, surfaceLabel });
      return;
    }

    const acceptedItem = {
      title,
      url,
      score,
      context: context.slice(0, 400),
      withinEditorsPicks: false,
      allowSoftPass: categoryListing || homeListing,
      categoryListing,
      homeListing,
      surfaceLabel
    };

    items.push(acceptedItem);
    if (stats) {
      stats.candidatesAccepted += 1;
      recordAcceptedSample(stats, acceptedItem);
    }
  });
}

function buildRescueCandidates(items, stats) {
  const rescued = [];
  const seen = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || !item.url || seen.has(item.url)) continue;
    if (item.withinEditorsPicks && item.score >= 6) {
      seen.add(item.url);
      const rescuedItem = { ...item, rescued: true };
      rescued.push(rescuedItem);
      recordRescuedSample(stats, rescuedItem);
      continue;
    }
    if ((item.allowSoftPass || item.categoryListing || item.homeListing) && item.score >= 6) {
      seen.add(item.url);
      const rescuedItem = { ...item, rescued: true };
      rescued.push(rescuedItem);
      recordRescuedSample(stats, rescuedItem);
    }
  }

  if (stats) {
    stats.rescuedCandidates = rescued.length;
  }

  return rescued;
}

function extractEditorsPicksLinks(html, logger, options = {}) {
  const $ = cheerio.load(html);
  const items = [];
  const stats = createStats();
  const categoryListing = !!options.categoryListing || isCategoryListingUrl(options.listingUrl) || options.sourceType === "category";
  const homeListing = !!options.homeListing || isHomeListingUrl(options.listingUrl) || options.sourceType === "home";

  $("h1,h2,h3,h4,strong,p,span,div").each((_, el) => {
    const text = cleanText($(el).text()).toLowerCase();
    if (!SURFACE_HEADING_RE.test(text)) return;
    stats.headingsMatched += 1;
    collectAroundHeading($, el, items, stats, {
      withinEditorsPicks: EDITORS_PICKS_RE.test(text),
      categoryListing,
      homeListing,
      surfaceLabel: getSurfaceLabel(text)
    });
  });

  if (categoryListing || homeListing) {
    collectCategoryListingCandidates($, items, stats, { categoryListing, homeListing });
  }

  if (items.length === 0) {
    stats.fallbackUsed = true;
    collectPageFallback($, items, stats, { categoryListing, homeListing });
  }

  const byUrl = new Map();
  for (const item of items) {
    const existing = byUrl.get(item.url);
    if (!existing || item.score > existing.score) {
      byUrl.set(item.url, item);
    }
  }

  const filtered = Array.from(byUrl.values());
  const rescuedPool = buildRescueCandidates(filtered, stats);
  const minimumScore = categoryListing || homeListing ? 5 : 7;
  const lowScoreDropped = filtered.filter((item) => item.score < minimumScore).length;
  if (lowScoreDropped) {
    stats.rejected.lowScore += lowScoreDropped;
  }

  let results = filtered
    .filter((item) => item.score >= minimumScore)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, NEWS_CANADA_CONFIG.maxEditorsPickLinks)
    .map(({ title, url, score, context, rescued, surfaceLabel }, index) => ({
      title,
      url,
      score,
      context,
      surfaceLabel,
      rescued: Boolean(rescued),
      position: index + 1
    }));

  if (results.length === 0 && rescuedPool.length > 0) {
    results = rescuedPool
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, Math.min(categoryListing || homeListing ? 12 : 8, NEWS_CANADA_CONFIG.maxEditorsPickLinks))
      .map(({ title, url, score, context, surfaceLabel }, index) => ({
        title,
        url,
        score,
        context,
        surfaceLabel,
        rescued: true,
        position: index + 1
      }));
  }

  if (logger && typeof logger.debug === "function") {
    logger.debug("[fetchEditorsPicks] extraction summary", {
      listingUrl: options.listingUrl || "",
      sourceType: options.sourceType || (categoryListing ? "category" : homeListing ? "home" : "editors-picks"),
      categoryListing,
      homeListing,
      headingsMatched: stats.headingsMatched,
      fallbackUsed: stats.fallbackUsed,
      candidatesFound: items.length,
      uniqueCandidates: byUrl.size,
      returned: results.length,
      lowScoreDropped,
      rescuePoolSize: rescuedPool.length,
      pathShapeSoftAccepted: stats.pathShapeSoftAccepted,
      topScores: filtered
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((item) => ({
          title: item.title,
          url: item.url,
          score: item.score,
          surfaceLabel: item.surfaceLabel || "",
          withinEditorsPicks: !!item.withinEditorsPicks,
          categoryListing: !!item.categoryListing,
          homeListing: !!item.homeListing
        })),
      acceptedSamples: stats.samples.accepted,
      rejectedSamples: stats.samples.rejected,
      lowScoreSamples: stats.samples.lowScore,
      rescuedSamples: stats.samples.rescued,
      stats
    });
  }

  if (logger && typeof logger.warn === "function" && results.length === 0) {
    logger.warn("[fetchEditorsPicks] no picks returned", {
      listingUrl: options.listingUrl || "",
      sourceType: options.sourceType || (categoryListing ? "category" : homeListing ? "home" : "editors-picks"),
      categoryListing,
      homeListing,
      headingsMatched: stats.headingsMatched,
      fallbackUsed: stats.fallbackUsed,
      rejected: stats.rejected,
      rejectedSamples: stats.samples.rejected,
      lowScoreSamples: stats.samples.lowScore,
      pathShapeSoftAccepted: stats.pathShapeSoftAccepted
    });
  }

  return results;
}

module.exports = { extractEditorsPicksLinks };

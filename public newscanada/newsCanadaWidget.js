(function () {
  "use strict";

  const MANUAL_URL = "https://sandblast-backend.onrender.com/api/newscanada/manual";
  const RSS_CANDIDATE_URLS = [
    "https://sandblast-backend.onrender.com/api/newscanada/rss",
    "https://sandblast-backend.onrender.com/api/news-canada",
    "https://sandblast-backend.onrender.com/api/newscanada/feed"
  ];

  const SLOT_ORDER = [
    "editors_pick",
    "top_story",
    "news_canada_1",
    "news_canada_2"
  ];

  const SELECTORS = {
    root: '[data-news-canada-root]',
    slideTrack: '[data-news-canada-track]',
    emptyState: '[data-news-canada-empty]'
  };

  let currentSlots = {};
  let currentRssItems = [];

  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function request(url, options) {
    const res = await fetch(url, Object.assign({
      method: "GET",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    }, options || {}));

    let payload = null;
    try {
      payload = await res.json();
    } catch (_) {
      payload = null;
    }

    if (!res.ok) {
      const message = payload && (payload.error || payload.message) ? (payload.error || payload.message) : ("Request failed: " + res.status);
      throw new Error(message);
    }

    return payload || {};
  }

  function normalizeManualStory(slotId, story) {
    return {
      id: story.id || slotId,
      slotId: slotId,
      headline: story.headline || "",
      summary: story.summary || "",
      body: story.body || "",
      imageUrl: story.imageUrl || "",
      imageAlt: story.imageAlt || story.headline || "News Canada story image",
      category: story.category || "",
      publishedAt: story.publishedAt || "",
      sourceName: story.sourceName || "News Canada",
      sourceUrl: story.sourceUrl || "",
      ctaText: story.ctaText || "See more stories at sandblastchannel.com",
      chipLabel: story.chipLabel || story.sourceName || "News Canada",
      isActive: Boolean(story.isActive),
      origin: "manual"
    };
  }

  function normalizeRssItem(item, index) {
    return {
      id: item.id || item.guid || item.link || ("rss-" + index),
      headline: item.headline || item.title || "",
      summary: item.summary || item.description || item.contentSnippet || "",
      body: item.body || item.content || item.description || item.contentSnippet || "",
      imageUrl: item.imageUrl || item.image || item.thumbnail || (item.enclosure && item.enclosure.url) || "",
      imageAlt: item.imageAlt || item.title || item.headline || "News Canada story image",
      category: item.category || item.categories && item.categories[0] || "News Canada",
      publishedAt: item.publishedAt || item.pubDate || item.isoDate || "",
      sourceName: item.sourceName || item.source || "News Canada",
      sourceUrl: item.sourceUrl || item.link || "",
      ctaText: item.ctaText || "Read full story",
      chipLabel: item.chipLabel || item.source || "News Canada",
      isActive: true,
      origin: "rss"
    };
  }

  async function fetchManualStories() {
    const payload = await request(MANUAL_URL);
    return payload.slots || {};
  }

  async function fetchRssStories() {
    let lastError = null;

    for (let i = 0; i < RSS_CANDIDATE_URLS.length; i += 1) {
      const url = RSS_CANDIDATE_URLS[i];

      try {
        const payload = await request(url);
        const rawItems = Array.isArray(payload.items)
          ? payload.items
          : Array.isArray(payload.stories)
            ? payload.stories
            : Array.isArray(payload.feed)
              ? payload.feed
              : [];

        return rawItems.map(normalizeRssItem).filter(function (item) {
          return item.headline;
        });
      } catch (err) {
        lastError = err;
      }
    }

    console.warn("[newsCanadaWidget] RSS load failed:", lastError ? lastError.message : "No RSS endpoint available");
    return [];
  }

  function mergeSlotsWithRss(slots, rssItems) {
    const merged = {};
    const rssQueue = Array.isArray(rssItems) ? rssItems.slice() : [];

    SLOT_ORDER.forEach(function (slotId) {
      const story = slots && slots[slotId] ? normalizeManualStory(slotId, slots[slotId]) : null;

      if (story && story.isActive && story.headline) {
        merged[slotId] = story;
        return;
      }

      const rssStory = rssQueue.shift();
      if (rssStory) {
        merged[slotId] = Object.assign({}, rssStory, { slotId: slotId });
      } else {
        merged[slotId] = normalizeManualStory(slotId, { id: slotId, isActive: false });
      }
    });

    return merged;
  }

  function renderStoryCard(slotId, story) {
    const isActive = story && story.isActive && story.headline;
    const headline = isActive ? story.headline : "Story coming soon";
    const chipLabel = story && story.chipLabel ? story.chipLabel : "News Canada";
    const summary = isActive ? (story.summary || "") : "Story feed is not populated yet.";
    const imageUrl = isActive && story.imageUrl ? story.imageUrl : "";
    const cardClass = isActive ? "nc-card" : "nc-card nc-card--empty";
    const originClass = story && story.origin ? (" nc-card--" + story.origin) : "";
    const imageMarkup = imageUrl
      ? '<div class="nc-card-image"><img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(story.imageAlt || headline) + '"></div>'
      : '<div class="nc-card-image nc-card-image--placeholder">No Image</div>';

    return ''
      + '<article class="' + cardClass + originClass + '" data-slot-id="' + escapeHtml(slotId) + '">'
      + imageMarkup
      +   '<div class="nc-card-body">'
      +     '<div class="nc-chip">' + escapeHtml(chipLabel) + '</div>'
      +     '<h3 class="nc-card-title">' + escapeHtml(headline) + '</h3>'
      +     '<p class="nc-card-summary">' + escapeHtml(summary) + '</p>'
      +   '</div>'
      + '</article>';
  }

  function renderSlides(slots) {
    const root = qs(SELECTORS.root);
    const track = qs(SELECTORS.slideTrack, root);
    const emptyState = qs(SELECTORS.emptyState, root);

    if (!root || !track) return;

    currentSlots = slots || {};

    const html = SLOT_ORDER.map(function (slotId) {
      return renderStoryCard(slotId, currentSlots[slotId] || {});
    }).join("");

    track.innerHTML = html;

    const hasAtLeastOneStory = SLOT_ORDER.some(function (slotId) {
      const story = currentSlots[slotId];
      return story && story.isActive && story.headline;
    });

    if (emptyState) {
      emptyState.style.display = hasAtLeastOneStory ? "none" : "block";
    }

    bindCardClicks();
  }

  function bindCardClicks() {
    const cards = document.querySelectorAll(".nc-card[data-slot-id]");

    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        const slotId = card.getAttribute("data-slot-id");
        const story = currentSlots[slotId];

        if (!story || !story.isActive || !story.headline) {
          return;
        }

        if (window.SandblastNewsCanadaModal && typeof window.SandblastNewsCanadaModal.open === "function") {
          window.SandblastNewsCanadaModal.open(story);
        } else if (story.sourceUrl) {
          window.open(story.sourceUrl, "_blank", "noopener,noreferrer");
        }
      });
    });
  }

  async function init() {
    try {
      const results = await Promise.allSettled([fetchManualStories(), fetchRssStories()]);
      const manualSlots = results[0].status === "fulfilled" ? results[0].value : {};
      currentRssItems = results[1].status === "fulfilled" ? results[1].value : [];

      const merged = mergeSlotsWithRss(manualSlots, currentRssItems);
      renderSlides(merged);
    } catch (err) {
      console.error("[newsCanadaWidget] init failed:", err);
    }
  }

  window.SandblastNewsCanadaWidget = {
    init: init,
    refresh: init,
    getSlots: function () {
      return currentSlots;
    },
    getRssItems: function () {
      return currentRssItems.slice();
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();

(function () {
  "use strict";

  const API_URL = "https://sandblast-backend.onrender.com/api/newscanada/manual";

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

  async function fetchManualStories() {
    const res = await fetch(API_URL, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error("Failed to load manual stories");
    }

    return res.json();
  }

  function renderStoryCard(slotId, story) {
    const isActive = story && story.isActive && story.headline;
    const headline = isActive ? story.headline : "Story coming soon";
    const chipLabel = story && story.chipLabel ? story.chipLabel : "News Canada";
    const summary = isActive ? (story.summary || "") : "Manual story slot is not populated yet.";
    const imageUrl = isActive && story.imageUrl ? story.imageUrl : "";
    const imageMarkup = imageUrl
      ? `<div class="nc-card-image"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(story.imageAlt || headline)}"></div>`
      : `<div class="nc-card-image nc-card-image--placeholder">No Image</div>`;

    return `
      <article class="nc-card ${isActive ? "" : "nc-card--empty"}" data-slot-id="${escapeHtml(slotId)}">
        ${imageMarkup}
        <div class="nc-card-body">
          <div class="nc-chip">${escapeHtml(chipLabel)}</div>
          <h3 class="nc-card-title">${escapeHtml(headline)}</h3>
          <p class="nc-card-summary">${escapeHtml(summary)}</p>
        </div>
      </article>
    `;
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
        }
      });
    });
  }

  async function init() {
    try {
      const payload = await fetchManualStories();
      renderSlides(payload.slots || {});
    } catch (err) {
      console.error("[newsCanadaWidget] init failed:", err);
    }
  }

  window.SandblastNewsCanadaWidget = {
    init,
    refresh: init,
    getSlots: function () {
      return currentSlots;
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})();

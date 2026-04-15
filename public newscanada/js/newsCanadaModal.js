(function () {
  "use strict";

  const SELECTORS = {
    modal: '[data-news-canada-modal]',
    closeButtons: '[data-news-canada-modal-close]',
    image: '[data-news-canada-modal-image]',
    chip: '[data-news-canada-modal-chip]',
    title: '[data-news-canada-modal-title]',
    summary: '[data-news-canada-modal-summary]',
    body: '[data-news-canada-modal-body]',
    meta: '[data-news-canada-modal-meta]',
    cta: '[data-news-canada-modal-cta]'
  };

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

  function getModal() {
    return qs(SELECTORS.modal);
  }

  function normalizeStory(story) {
    if (!story) return null;

    return {
      imageUrl: story.imageUrl || story.image || "",
      imageAlt: story.imageAlt || story.title || story.headline || "Story image",
      chipLabel: story.chipLabel || story.sourceName || story.source || "News Canada",
      headline: story.headline || story.title || "",
      summary: story.summary || story.description || "",
      body: story.body || story.content || story.description || "",
      category: story.category || "",
      publishedAt: story.publishedAt || story.pubDate || story.isoDate || "",
      sourceUrl: story.sourceUrl || story.link || "",
      ctaText: story.ctaText || "Read full story"
    };
  }

  function open(story) {
    const modal = getModal();
    const normalized = normalizeStory(story);

    if (!modal || !normalized) return;

    const imageEl = qs(SELECTORS.image, modal);
    const chipEl = qs(SELECTORS.chip, modal);
    const titleEl = qs(SELECTORS.title, modal);
    const summaryEl = qs(SELECTORS.summary, modal);
    const bodyEl = qs(SELECTORS.body, modal);
    const metaEl = qs(SELECTORS.meta, modal);
    const ctaEl = qs(SELECTORS.cta, modal);

    if (imageEl) {
      imageEl.innerHTML = normalized.imageUrl
        ? '<img src="' + escapeHtml(normalized.imageUrl) + '" alt="' + escapeHtml(normalized.imageAlt) + '">'
        : '<div class="nc-modal-image-placeholder">No Image</div>';
    }

    if (chipEl) chipEl.textContent = normalized.chipLabel;
    if (titleEl) titleEl.textContent = normalized.headline;
    if (summaryEl) summaryEl.textContent = normalized.summary;
    if (bodyEl) bodyEl.textContent = normalized.body;

    if (metaEl) {
      const parts = [];
      if (normalized.category) parts.push(normalized.category);
      if (normalized.publishedAt) parts.push(normalized.publishedAt);
      metaEl.textContent = parts.join(" • ");
    }

    if (ctaEl) {
      if (normalized.sourceUrl) {
        ctaEl.innerHTML = '<a href="' + escapeHtml(normalized.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(normalized.ctaText) + '</a>';
      } else {
        ctaEl.textContent = normalized.ctaText;
      }
    }

    modal.classList.add("is-open");
  }

  function close() {
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove("is-open");
  }

  function bindCloseEvents() {
    document.querySelectorAll(SELECTORS.closeButtons).forEach(function (button) {
      button.addEventListener("click", close);
    });
  }

  function init() {
    bindCloseEvents();
  }

  window.SandblastNewsCanadaModal = {
    init: init,
    open: open,
    close: close
  };

  document.addEventListener("DOMContentLoaded", init);
})();
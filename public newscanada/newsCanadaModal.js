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

  function open(story) {
    const modal = getModal();
    if (!modal || !story) return;

    const imageEl = qs(SELECTORS.image, modal);
    const chipEl = qs(SELECTORS.chip, modal);
    const titleEl = qs(SELECTORS.title, modal);
    const summaryEl = qs(SELECTORS.summary, modal);
    const bodyEl = qs(SELECTORS.body, modal);
    const metaEl = qs(SELECTORS.meta, modal);
    const ctaEl = qs(SELECTORS.cta, modal);

    if (imageEl) {
      imageEl.innerHTML = story.imageUrl
        ? `<img src="${escapeHtml(story.imageUrl)}" alt="${escapeHtml(story.imageAlt || story.headline || "Story image")}">`
        : `<div class="nc-modal-image-placeholder">No Image</div>`;
    }

    if (chipEl) chipEl.textContent = story.chipLabel || "News Canada";
    if (titleEl) titleEl.textContent = story.headline || "";
    if (summaryEl) summaryEl.textContent = story.summary || "";
    if (bodyEl) bodyEl.textContent = story.body || "";

    if (metaEl) {
      const parts = [];
      if (story.category) parts.push(story.category);
      if (story.publishedAt) parts.push(story.publishedAt);
      metaEl.textContent = parts.join(" • ");
    }

    if (ctaEl) {
      if (story.sourceUrl) {
        ctaEl.innerHTML = `<a href="${escapeHtml(story.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(story.ctaText || "See more stories at sandblastchannel.com")}</a>`;
      } else {
        ctaEl.textContent = story.ctaText || "See more stories at sandblastchannel.com";
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
    init,
    open,
    close
  };

  document.addEventListener("DOMContentLoaded", init);
})();

(function () {
  "use strict";

  const MANUAL_BASE = "https://sandblast-backend.onrender.com/api/newscanada/manual";
  const RSS_CANDIDATE_URLS = [
    "https://sandblast-backend.onrender.com/api/newscanada/rss",
    "https://sandblast-backend.onrender.com/api/news-canada",
    "https://sandblast-backend.onrender.com/api/newscanada/feed"
  ];

  const SLOT_OPTIONS = [
    { value: "editors_pick", label: "Editor's Pick" },
    { value: "top_story", label: "Top Story" },
    { value: "news_canada_1", label: "News Canada 1" },
    { value: "news_canada_2", label: "News Canada 2" }
  ];

  const SELECTORS = {
    modal: '[data-news-canada-admin-modal]',
    form: '[data-news-canada-admin-form]',
    openButtons: '[data-news-canada-admin-open]',
    closeButtons: '[data-news-canada-admin-close]',
    saveButton: '[data-news-canada-admin-save]',
    clearButton: '[data-news-canada-admin-clear]',
    imagePreview: '[data-news-canada-image-preview]',
    slotId: '[name="slotId"]',
    headline: '[name="headline"]',
    summary: '[name="summary"]',
    body: '[name="body"]',
    imageUrl: '[name="imageUrl"]',
    imageAlt: '[name="imageAlt"]',
    category: '[name="category"]',
    publishedAt: '[name="publishedAt"]',
    sourceName: '[name="sourceName"]',
    sourceUrl: '[name="sourceUrl"]',
    ctaText: '[name="ctaText"]',
    isActive: '[name="isActive"]'
  };

  let currentSlots = {};
  let rssItems = [];

  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function qsa(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function getModal() {
    return qs(SELECTORS.modal);
  }

  function getForm() {
    return qs(SELECTORS.form);
  }

  function clean(value) {
    return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
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

  function formatPublishedAt(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return clean(value);
    return d.toLocaleString();
  }

  function normalizeRssItem(item, index) {
    const title = clean(item.title || item.headline);
    const description = clean(item.description || item.summary || item.contentSnippet || "");
    const body = clean(item.body || item.content || item.contentSnippet || item.summary || "");
    const link = clean(item.link || item.sourceUrl || item.guid || "");
    const imageUrl = clean(
      item.imageUrl ||
      item.image ||
      (item.enclosure && item.enclosure.url) ||
      ""
    );

    return {
      id: clean(item.id || item.guid || link || ("rss-" + index)),
      headline: title,
      summary: description,
      body: body,
      imageUrl: imageUrl,
      imageAlt: clean(item.imageAlt || title || "News Canada story image"),
      category: clean(item.category || item.categories && item.categories[0] || "News Canada"),
      publishedAt: formatPublishedAt(item.publishedAt || item.pubDate || item.isoDate || ""),
      sourceName: clean(item.sourceName || item.source || "News Canada"),
      sourceUrl: link,
      ctaText: clean(item.ctaText || "Read full story"),
      chipLabel: clean(item.chipLabel || item.source || "News Canada"),
      isActive: true,
      origin: "rss"
    };
  }

  async function loadSlots() {
    const payload = await request(MANUAL_BASE, { method: "GET" });
    currentSlots = payload.slots || {};
    return currentSlots;
  }

  async function loadRssItems() {
    let lastError = null;

    for (let i = 0; i < RSS_CANDIDATE_URLS.length; i += 1) {
      const url = RSS_CANDIDATE_URLS[i];

      try {
        const payload = await request(url, { method: "GET" });
        const rawItems = Array.isArray(payload.items)
          ? payload.items
          : Array.isArray(payload.stories)
            ? payload.stories
            : Array.isArray(payload.feed)
              ? payload.feed
              : [];

        rssItems = rawItems.map(normalizeRssItem).filter(function (item) {
          return item.headline;
        });

        return rssItems;
      } catch (err) {
        lastError = err;
      }
    }

    console.warn("[newsCanadaAdmin] RSS load failed:", lastError ? lastError.message : "No RSS endpoint available");
    rssItems = [];
    return rssItems;
  }

  function updateImagePreview() {
    const form = getForm();
    const preview = qs(SELECTORS.imagePreview, form);
    const imageUrl = clean(qs(SELECTORS.imageUrl, form).value);

    if (!preview) return;

    if (!imageUrl) {
      preview.innerHTML = '<div class="nc-admin-preview-placeholder">No image selected</div>';
      return;
    }

    preview.innerHTML = '<img src="' + escapeHtml(imageUrl) + '" alt="Story preview image">';
  }

  function fillForm(story) {
    const form = getForm();
    if (!form) return;

    qs(SELECTORS.slotId, form).value = story.id || "";
    qs(SELECTORS.headline, form).value = story.headline || "";
    qs(SELECTORS.summary, form).value = story.summary || "";
    qs(SELECTORS.body, form).value = story.body || "";
    qs(SELECTORS.imageUrl, form).value = story.imageUrl || "";
    qs(SELECTORS.imageAlt, form).value = story.imageAlt || "";
    qs(SELECTORS.category, form).value = story.category || "";
    qs(SELECTORS.publishedAt, form).value = story.publishedAt || "";
    qs(SELECTORS.sourceName, form).value = story.sourceName || "News Canada";
    qs(SELECTORS.sourceUrl, form).value = story.sourceUrl || "";
    qs(SELECTORS.ctaText, form).value = story.ctaText || "See more stories at sandblastchannel.com";
    qs(SELECTORS.isActive, form).checked = story.isActive !== false;

    updateImagePreview();
  }

  function serializeForm() {
    const form = getForm();

    return {
      slotId: clean(qs(SELECTORS.slotId, form).value),
      headline: clean(qs(SELECTORS.headline, form).value),
      summary: clean(qs(SELECTORS.summary, form).value),
      body: clean(qs(SELECTORS.body, form).value),
      imageUrl: clean(qs(SELECTORS.imageUrl, form).value),
      imageAlt: clean(qs(SELECTORS.imageAlt, form).value),
      category: clean(qs(SELECTORS.category, form).value),
      publishedAt: clean(qs(SELECTORS.publishedAt, form).value),
      sourceName: clean(qs(SELECTORS.sourceName, form).value) || "News Canada",
      sourceUrl: clean(qs(SELECTORS.sourceUrl, form).value),
      ctaText: clean(qs(SELECTORS.ctaText, form).value) || "See more stories at sandblastchannel.com",
      isActive: Boolean(qs(SELECTORS.isActive, form).checked)
    };
  }

  async function saveStory() {
    const payload = serializeForm();

    const result = await request(MANUAL_BASE + "/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!result.ok) {
      throw new Error(result.error || "Save failed");
    }

    currentSlots = result.slots || currentSlots;

    if (window.SandblastNewsCanadaWidget && typeof window.SandblastNewsCanadaWidget.refresh === "function") {
      window.SandblastNewsCanadaWidget.refresh();
    }

    closeModal();
  }

  async function clearStory() {
    const form = getForm();
    const slotId = clean(qs(SELECTORS.slotId, form).value);

    if (!slotId) {
      throw new Error("Select a slot first");
    }

    const result = await request(MANUAL_BASE + "/clear", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ slotId: slotId })
    });

    if (!result.ok) {
      throw new Error(result.error || "Clear failed");
    }

    currentSlots = result.slots || currentSlots;
    fillForm(result.story || { id: slotId });

    if (window.SandblastNewsCanadaWidget && typeof window.SandblastNewsCanadaWidget.refresh === "function") {
      window.SandblastNewsCanadaWidget.refresh();
    }
  }

  function importLatestRssStoryIntoForm() {
    if (!rssItems.length) {
      alert("No RSS stories are currently available.");
      return;
    }

    const currentSlotId = clean(qs(SELECTORS.slotId, getForm()).value);
    const sourceStory = rssItems[0];
    fillForm(Object.assign({}, sourceStory, {
      id: currentSlotId || sourceStory.id
    }));
  }

  function openModal(slotId) {
    const modal = getModal();
    if (!modal) return;

    const story = currentSlots[slotId] || {
      id: slotId || "",
      headline: "",
      summary: "",
      body: "",
      imageUrl: "",
      imageAlt: "",
      category: "",
      publishedAt: "",
      sourceName: "News Canada",
      sourceUrl: "",
      ctaText: "See more stories at sandblastchannel.com",
      isActive: false
    };

    fillForm(story);
    modal.classList.add("is-open");
  }

  function closeModal() {
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove("is-open");
  }

  function bindOpenButtons() {
    qsa(SELECTORS.openButtons).forEach(function (button) {
      button.addEventListener("click", async function () {
        const slotId = button.getAttribute("data-slot-id") || "";
        try {
          await Promise.all([loadSlots(), loadRssItems()]);
          openModal(slotId);
        } catch (err) {
          console.error("[newsCanadaAdmin] open failed:", err);
        }
      });
    });
  }

  function bindCloseButtons() {
    qsa(SELECTORS.closeButtons).forEach(function (button) {
      button.addEventListener("click", closeModal);
    });
  }

  function bindFormEvents() {
    const form = getForm();
    if (!form) return;

    const imageInput = qs(SELECTORS.imageUrl, form);
    const saveButton = qs(SELECTORS.saveButton, form);
    const clearButton = qs(SELECTORS.clearButton, form);

    if (imageInput) {
      imageInput.addEventListener("input", updateImagePreview);
    }

    if (saveButton) {
      saveButton.addEventListener("click", async function (event) {
        event.preventDefault();
        try {
          await saveStory();
        } catch (err) {
          alert(err.message || "Save failed");
        }
      });
    }

    if (clearButton) {
      clearButton.addEventListener("click", async function (event) {
        event.preventDefault();
        try {
          await clearStory();
        } catch (err) {
          alert(err.message || "Clear failed");
        }
      });
    }

    if (!qs('[data-news-canada-import-rss]', form)) {
      const importButton = document.createElement("button");
      importButton.type = "button";
      importButton.setAttribute("data-news-canada-import-rss", "true");
      importButton.className = "nc-admin-import-rss";
      importButton.textContent = "Import latest RSS story";
      importButton.addEventListener("click", async function (event) {
        event.preventDefault();
        try {
          if (!rssItems.length) {
            await loadRssItems();
          }
          importLatestRssStoryIntoForm();
        } catch (err) {
          alert(err.message || "RSS import failed");
        }
      });

      const controlsAnchor = clearButton && clearButton.parentNode ? clearButton.parentNode : form;
      controlsAnchor.appendChild(importButton);
    }
  }

  function populateSlotSelect() {
    const form = getForm();
    const select = form ? qs(SELECTORS.slotId, form) : null;
    if (!select) return;

    if (select.options.length > 0) return;

    SLOT_OPTIONS.forEach(function (option) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      select.appendChild(el);
    });
  }

  async function init() {
    populateSlotSelect();
    bindOpenButtons();
    bindCloseButtons();
    bindFormEvents();

    try {
      await Promise.all([loadSlots(), loadRssItems()]);
    } catch (err) {
      console.error("[newsCanadaAdmin] init failed:", err);
    }
  }

  window.SandblastNewsCanadaAdmin = {
    init: init,
    open: openModal,
    close: closeModal,
    reload: loadSlots,
    reloadRss: loadRssItems,
    getRssItems: function () {
      return rssItems.slice();
    },
    importLatestRssStoryIntoForm: importLatestRssStoryIntoForm
  };

  document.addEventListener("DOMContentLoaded", init);
})();

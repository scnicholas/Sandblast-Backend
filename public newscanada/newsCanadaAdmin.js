(function () {
  "use strict";

  const SAVE_URL = "https://sandblast-backend.onrender.com/api/newscanada/manual/save";
  const CLEAR_URL = "https://sandblast-backend.onrender.com/api/newscanada/manual/clear";
  const LOAD_URL = "https://sandblast-backend.onrender.com/api/newscanada/manual";

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

  async function loadSlots() {
    const res = await fetch(LOAD_URL, {
      method: "GET",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      throw new Error("Failed to load slots");
    }

    const payload = await res.json();
    currentSlots = payload.slots || {};
    return currentSlots;
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

    preview.innerHTML = `<img src="${imageUrl}" alt="Story preview image">`;
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
    qs(SELECTORS.isActive, form).checked = Boolean(story.isActive);

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

    const res = await fetch(SAVE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (!res.ok || !result.ok) {
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

    const res = await fetch(CLEAR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ slotId })
    });

    const result = await res.json();

    if (!res.ok || !result.ok) {
      throw new Error(result.error || "Clear failed");
    }

    currentSlots = result.slots || currentSlots;
    fillForm(result.story || { id: slotId });

    if (window.SandblastNewsCanadaWidget && typeof window.SandblastNewsCanadaWidget.refresh === "function") {
      window.SandblastNewsCanadaWidget.refresh();
    }
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
          await loadSlots();
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
      await loadSlots();
    } catch (err) {
      console.error("[newsCanadaAdmin] init failed:", err);
    }
  }

  window.SandblastNewsCanadaAdmin = {
    init,
    open: openModal,
    close: closeModal,
    reload: loadSlots
  };

  document.addEventListener("DOMContentLoaded", init);
})();

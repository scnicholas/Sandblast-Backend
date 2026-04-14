(function () {
  "use strict";

  const BASE = "https://sandblast-backend.onrender.com/api/newscanada";
  const ENDPOINTS = {
    manual: `${BASE}/manual`,
    save: `${BASE}/manual/save`,
    clear: `${BASE}/manual/clear`
  };

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
      const message =
        (payload && (payload.error || payload.message)) ||
        `Request failed: ${res.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async function loadManualSlots() {
    return request(ENDPOINTS.manual, {
      method: "GET"
    });
  }

  async function saveManualStory(data) {
    return request(ENDPOINTS.save, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(data || {})
    });
  }

  async function clearManualStory(slotId) {
    return request(ENDPOINTS.clear, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ slotId: slotId || "" })
    });
  }

  window.SandblastNewsCanadaAPI = {
    loadManualSlots,
    saveManualStory,
    clearManualStory,
    endpoints: ENDPOINTS
  };
})();

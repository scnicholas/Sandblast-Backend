(function () {
  const FEED_URL = "https://sandblast-backend.onrender.com/api/newscanada/editors-picks";

  async function loadNewsCanadaFeed() {
    const res = await fetch(FEED_URL, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      throw new Error("Feed request failed with status " + res.status);
    }

    const payload = await res.json();
    const stories = Array.isArray(payload) ? payload
      : Array.isArray(payload && payload.items) ? payload.items
      : Array.isArray(payload && payload.stories) ? payload.stories
      : Array.isArray(payload && payload.data) ? payload.data
      : [];

    return stories.filter(function (item) {
      return item && item.title && item.url;
    }).slice(0, 8);
  }

  window.SandblastNewsCanada = { FEED_URL, loadNewsCanadaFeed };
})();

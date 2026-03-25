(function () {
  const FEED_URL = "https://sandblast-backend.onrender.com/api/newscanada/editors-picks";
  const STORY_URL = "https://sandblast-backend.onrender.com/api/newscanada/story";
  const MAX_STORIES = 12;

  function hasFullStory(item) {
    if (!item || typeof item !== "object") return false;
    return [item.body, item.content, item.story, item.fullText, item.articleBody, item.text]
      .some(function (value) { return typeof value === "string" && value.trim().length >= 80; });
  }

  function normalizeFeedPayload(payload) {
    const stories = Array.isArray(payload) ? payload
      : Array.isArray(payload && payload.items) ? payload.items
      : Array.isArray(payload && payload.stories) ? payload.stories
      : Array.isArray(payload && payload.data) ? payload.data
      : [];

    return stories.filter(function (item) {
      return item && item.title && item.url && (item.summary || hasFullStory(item));
    }).slice(0, MAX_STORIES);
  }

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

    return normalizeFeedPayload(await res.json());
  }

  async function loadNewsCanadaStory(item) {
    const storyUrl = item && item.url ? item.url : "";
    const storyId = item && item.id ? item.id : "";
    const query = storyUrl ? ("?url=" + encodeURIComponent(storyUrl)) : storyId ? ("?id=" + encodeURIComponent(storyId)) : "";
    const res = await fetch(STORY_URL + query, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      throw new Error("Story request failed with status " + res.status);
    }

    const payload = await res.json();
    return payload && payload.story ? payload.story : payload;
  }

  window.SandblastNewsCanada = { FEED_URL, STORY_URL, loadNewsCanadaFeed, loadNewsCanadaStory, normalizeFeedPayload };
})();

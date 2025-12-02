// index.js
// Sandblast Backend – Core Server + Intent Routing

const express = require("express");
const cors = require("cors");
const { classifyIntent } = require("./utils/intentClassifier"); // ensure this path is correct

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Use Render's port or default to 3000 locally
const PORT = process.env.PORT || 3000;

// --------------------------------------------
// Health Check Route
// --------------------------------------------
app.get("/", (req, res) => {
  res.send("Sandblast backend is running.");
});

// --------------------------------------------
// Main AI Brain Endpoint
// --------------------------------------------
app.post("/api/sandblast-gpt", (req, res) => {
  const userMessage = req.body.message || "";

  // 1. Classify intent
  const intent = classifyIntent(userMessage);

  // 2. Build structured response (Phase 1 – routing only)
  let payload = {
    intent,            // "tv_video", "music_radio", etc.
    echo: userMessage, // what user sent
  };

  switch (intent) {
    case "tv_video":
      payload.category = "tv_video";
      payload.message =
        "I’ve classified this as a Sandblast TV / video request. I can route users to shows, movies, and retro programming.";
      break;

    case "music_radio":
      payload.category = "music_radio";
      payload.message =
        "I’ve classified this as a Sandblast Radio / music request. I can route users to live radio, DJ Nova, Gospel Sunday, and playlists.";
      break;

    case "news_canada":
      payload.category = "news_canada";
      payload.message =
        "I’ve classified this as a News Canada request. I can route users to articles, features, and updates.";
      break;

    case "advertising":
      payload.category = "advertising";
      payload.message =
        "I’ve classified this as an Advertising / Promotions request. I can guide users toward running ads or sponsoring shows on Sandblast.";
      break;

    case "ai_consulting":
      payload.category = "ai_consulting";
      payload.message =
        "I’ve classified this as an AI Consulting / AI help request. I can guide users to Sandblast AI Consulting services.";
      break;

    default:
      payload.category = "general";
      payload.message =
        "I’m treating this as a general request. I handle TV, radio/music, News Canada, advertising, and AI consulting. Ask me what you’d like to do, and I’ll route you correctly.";
      break;
  }

  return res.json(payload);
});

// --------------------------------------------
// Test Endpoint
// --------------------------------------------
app.post("/api/sandblast-gpt-test", (req, res) => {
  res.json({
    ok: true,
    message:
      'Backend test successful. Use "/api/sandblast-gpt" with { "message": "Hello" } to test routing.'
  });
});

// --------------------------------------------
// Start Server
// --------------------------------------------
app.listen(PORT, () => {
  console.log(`Sandblast backend listening on port ${PORT}`);
});

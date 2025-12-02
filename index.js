// index.js
// Sandblast Backend – Core Server + Intent Routing

const express = require("express");
const cors = require("cors");
const { classifyIntent } = require("./Utils/intentClassifier");

// Import response modules
const musicModule = require("./responseModules/musicModule");
const tvModule = require("./responseModules/tvModule");
const newsModule = require("./responseModules/newsModule");
const advertisingModule = require("./responseModules/advertisingModule");
const aiConsultingModule = require("./responseModules/aiConsultingModule");

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

  // 1. Classify the user's intent
  const intent = classifyIntent(userMessage);

  // 2. Build the response based on the intent
  let payload = { intent, echo: userMessage };

  switch (intent) {
    case "music_radio":
      payload = musicModule.getMusicResponse(userMessage);
      break;

    case "tv_video":
      payload = tvModule.getTvResponse(userMessage);
      break;

    case "news_canada":
      payload = newsModule.getNewsResponse(userMessage);
      break;

    case "advertising":
      payload = advertisingModule.getAdvertisingResponse(userMessage);
      break;

    case "ai_consulting":
      payload = aiConsultingModule.getAiConsultingResponse(userMessage);
      break;

    default:
      payload.message = "I’m not sure what you meant. Please try asking in a different way.";
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
    message: 'Backend test successful. Use "/api/sandblast-gpt" with { "message": "Hello" } to test routing.'
  });
});

// --------------------------------------------
// Start Server
// --------------------------------------------
app.listen(PORT, () => {
  console.log(`Sandblast backend listening on port ${PORT}`);
});

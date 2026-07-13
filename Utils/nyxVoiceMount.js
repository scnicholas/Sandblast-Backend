"use strict";

/**
 * Drop-in Nyx voice route mount.
 * Call once after express.json()/express.urlencoded() and before the 404 handler:
 *   require("./Routes/nyxVoiceMount")(app);
 */
const tts = require("./tts");
const voiceRoute = require("./voiceRoute");

function resolveHandler() {
  return tts.handleTts || tts.ttsHandler || tts.handler || voiceRoute.voiceRoute || voiceRoute;
}

function mountNyxVoice(app) {
  if (!app || typeof app.get !== "function" || typeof app.post !== "function") {
    throw new TypeError("mountNyxVoice requires an Express app instance.");
  }

  app.locals = app.locals || {};
  if (app.locals.__sandblastNyxVoiceMounted) return app;
  app.locals.__sandblastNyxVoiceMounted = true;

  const handler = resolveHandler();
  const routes = ["/api/tts", "/tts"];

  for (const route of routes) {
    app.options(route, handler);
    app.get(route, handler);
    app.post(route, handler);
  }

  app.get("/api/tts/health", async (_req, res) => {
    try {
      const snapshot = typeof tts.health === "function" ? await Promise.resolve(tts.health()) : { ok: true };
      return res.status(snapshot && snapshot.ok === false ? 503 : 200).json(snapshot || { ok: true });
    } catch (error) {
      return res.status(503).json({ ok: false, error: String(error && (error.message || error) || "tts_health_failed") });
    }
  });

  return app;
}

module.exports = mountNyxVoice;
module.exports.mountNyxVoice = mountNyxVoice;
module.exports.routes = Object.freeze(["/api/tts", "/tts", "/api/tts/health"]);

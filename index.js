//----------------------------------------------------------
// Sandblast Nyx Backend — Local Brain Version (No OpenAI)
//----------------------------------------------------------

const express = require("express");
const cors = require("cors");

const { classifyIntent } = require("./Utils/intentClassifier");
const nyxPersonality = require("./Utils/nyxPersonality");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

//----------------------------------------------------------
// META HELPERS
//----------------------------------------------------------
function cleanMeta(meta) {
  if (!meta || typeof meta !== "object") {
    return {
      stepIndex: 0,
      lastDomain: "general",
      lastIntent: "statement",
      lastGoal: null,
      sessionId: "nyx-" + Date.now()
    };
  }

  return {
    stepIndex: typeof meta.stepIndex === "number" ? meta.stepIndex : 0,
    lastDomain: meta.lastDomain || "general",
    lastIntent: meta.lastIntent || "statement",
    lastGoal: meta.lastGoal || null,
    sessionId: meta.sessionId || "nyx-" + Date.now()
  };
}

function isAdminMessage(body) {
  if (!body || typeof body !== "object") return false;
  const { adminToken, message } = body;
  if (adminToken && adminToken === process.env.ADMIN_SECRET) return true;
  if (typeof message === "string" && message.trim().startsWith("::admin")) return true;
  return false;
}

//----------------------------------------------------------
// LOCAL BRAIN – DOMAIN RULES
//----------------------------------------------------------
function localBrainReply(message, classification, meta) {
  const domain = classification?.domain || "general";
  const intent = classification?.intent || "statement";
  const text = (message || "").trim().toLowerCase();

  // You can tune these any time; no deploy changes to the widget needed.
  switch (domain) {
    case "tv":
      return (
        `Let’s keep TV simple and realistic.\n\n` +
        `Pick ONE block to focus on, like “weeknight detective hour” or “Saturday westerns.” Decide:\n` +
        `• Start time and duration\n` +
        `• 2–3 shows that fit that mood\n` +
        `• One clear reason you’d promote it (nostalgia, family time, comfort viewing).\n\n` +
        `Tell me which block you want to shape and I’ll help you tune it.`
      );

    case "radio":
      return (
        `For radio, think in mood blocks, not random tracks.\n\n` +
        `Choose the vibe (late-night smooth, Gospel Sunday uplift, retro party) and how long the block should run. ` +
        `DJ Nova can carry short intros, lifestyle lines, and sponsor mentions without overloading the mix.\n\n` +
        `Tell me the mood and length you’re thinking about and we’ll sketch a simple flow.`
      );

    case "sponsors":
      return (
        `Let’s treat sponsors the way a growing channel should.\n\n` +
        `Start with a 4-week test package instead of a giant promise. For example:\n` +
        `• 2 TV spots per week around a key block\n` +
        `• 2–3 on-air mentions from DJ Nova\n` +
        `• One clear call to action (visit, call, or follow).\n\n` +
        `Proof point: Sandblast reaches people who deliberately choose nostalgia content, so they’re paying more attention than social scrollers.\n` +
        `Next action: pick ONE real sponsor prospect and sketch a small 4-week “awareness only” package for them.`
      );

    case "ai_help":
    case "ai_consulting":
      return (
        `Here’s how to keep AI practical and not overwhelming.\n\n` +
        `Start with 3–5 repeatable use cases instead of “AI everything.” Examples:\n` +
        `• Drafting outreach emails and proposals\n` +
        `• Summarizing long documents or meetings\n` +
        `• Writing show descriptions and social captions\n` +
        `• Helping job-seekers tune resumes and cover letters.\n\n` +
        `Tell me who you want to help first (job-seekers, small businesses, sponsors, or your own team) and I’ll map a short, realistic AI plan for them.`
      );

    case "tech_support":
      return (
        `For tech, keep it to one clean path end-to-end.\n\n` +
        `Step 1: Make sure the backend responds at /health and /api/sandblast-gpt.\n` +
        `Step 2: Point the widget to that exact URL.\n` +
        `Step 3: Add more features only AFTER that path is stable.\n\n` +
        `Tell me where it’s failing right now — Webflow, Render, or the code — and I’ll walk you through it.`
      );

    case "business_support":
      return (
        `Let’s ground the business side.\n\n` +
        `Pick ONE project (Sandblast, consulting, a grant, or a store concept) and define:\n` +
        `• A 90-day goal\n` +
        `• One metric to track (viewers, leads, sign-ups, or revenue)\n` +
        `• A small weekly action you can repeat.\n\n` +
        `Tell me which project you want to prioritize and I’ll help you set that 90-day focus.`
      );

    case "radio_nova":
    case "nova":
      return (
        `Nova works best when the block has a clear mood and purpose.\n\n` +
        `Decide the feeling (for example, “late-night city lights,” “Sunday uplift,” or “90s R&B nostalgia”) and how long you want her on air.\n` +
        `From there, we can shape her intros, transitions, and any sponsor mentions so it sounds intentional, not random.`
      );

    default:
      if (intent === "greeting") {
        return (
          `You’re tuned into Nyx, the AI brain behind Sandblast.\n\n` +
          `I can help you shape TV blocks, radio shows, sponsor packages, News Canada placement, and practical AI ideas for a growing channel.\n` +
          `Tell me what lane you want to start with: TV, radio, streaming, sponsors, or AI?`
        );
      }

      return (
        `I’ve got you.\n\n` +
        `Give me a bit more context: are you working on TV, radio, streaming, sponsors, News Canada, or AI right now? ` +
        `Once I know the lane, I’ll give you a clear next step instead of just theory.`
      );
  }
}

//----------------------------------------------------------
// HEALTH
//----------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "sandblast-nyx-backend-local" });
});

//----------------------------------------------------------
// MAIN BRAIN ENDPOINT
//----------------------------------------------------------
app.post("/api/sandblast-gpt", async (req, res) => {
  try {
    const { message, meta: incomingMeta, mode } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "EMPTY_MESSAGE" });
    }

    const clean = message.trim();
    const meta = cleanMeta(incomingMeta);

    // Admin / backdoor stub
    if (isAdminMessage(req.body)) {
      return res.json({
        ok: true,
        admin: true,
        message: "Admin backdoor reached. Debug hooks can live here later.",
        meta
      });
    }

    // 1) Classify
    const classification = classifyIntent(clean);

    // 2) Front-door response (optional)
    let frontDoor = null;
    if (nyxPersonality.getFrontDoorResponse) {
      frontDoor = nyxPersonality.getFrontDoorResponse(
        clean,
        meta,
        classification
      );
    }

    // 3) Domain payload (for UI / future)
    let domainPayload = {};
    if (nyxPersonality.enrichDomainResponse) {
      domainPayload = nyxPersonality.enrichDomainResponse(
        clean,
        meta,
        classification,
        mode
      );
    }

    // 4) Local brain reply
    const rawReply = localBrainReply(clean, classification, meta);

    // 5) Tone wrapper
    let finalReply = rawReply;
    if (nyxPersonality.wrapWithNyxTone) {
      finalReply = nyxPersonality.wrapWithNyxTone(
        clean,
        meta,
        classification,
        rawReply
      );
    }

    // 6) Update meta
    const updatedMeta = {
      ...meta,
      stepIndex: meta.stepIndex + 1,
      lastDomain: classification.domain,
      lastIntent: classification.intent
    };

    // 7) Respond
    res.json({
      ok: true,
      reply: finalReply,
      frontDoor,
      domain: classification.domain,
      intent: classification.intent,
      confidence: classification.confidence,
      domainPayload,
      meta: updatedMeta
    });
  } catch (err) {
    console.error("[Nyx] /api/sandblast-gpt error:", err.message);
    res.status(500).json({
      ok: false,
      error: "SERVER_FAILURE",
      message: "Nyx hit static inside the server.",
      details: err.message
    });
  }
});

//----------------------------------------------------------
// TTS STUB (OPTIONAL)
//----------------------------------------------------------
app.post("/api/tts", async (req, res) => {
  // For now, voice is disabled in local brain mode.
  return res.status(501).json({
    error: "TTS_DISABLED",
    message: "TTS is disabled in this local brain build."
  });
});

//----------------------------------------------------------
// START SERVER
//----------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Nyx local backend listening on port ${PORT}`);
});

function buildSponsorPackage(businessType = "local business", budgetTier = "starter") {
  const biz = businessType || "local business";
  const tier = (budgetTier || "starter").toLowerCase();

  const price =
    tier === "high" || tier === "premium" ? "$750–$1,500 / month" :
    tier === "medium" ? "$300–$700 / month" :
    "$99–$299 / month";

  return (
    `Sponsor Package (Draft)\n\n` +
    `Sponsor type: ${biz}\n` +
    `Budget tier: ${budgetTier || "starter"}\n\n` +
    `Offer (simple + testable):\n` +
    `- 4-week test run\n` +
    `- 6–12 on-air mentions (split across peak blocks)\n` +
    `- 1 website placement (Ad Space) + link\n` +
    `- 1 “community shout-out” style read (fits Sandblast tone)\n\n` +
    `Price guidance: ${price}\n\n` +
    `Proof point to include: “Measured clicks + inquiries over 4 weeks.”\n` +
    `Next action: tell me the sponsor name + which block you want them attached to.`
  );
}

function buildTvBlock(mood = "detective", timeOfDay = "evening", decade = "60s") {
  return (
    `TV Block Draft\n\n` +
    `Vibe: ${mood || "detective"}\n` +
    `Time: ${timeOfDay || "evening"}\n` +
    `Era: ${decade || "60s"}\n\n` +
    `Structure:\n` +
    `1) Opener (fast hook)\n` +
    `2) Anchor show (best-known title)\n` +
    `3) Deep-cut follow-up (keeps retention)\n` +
    `4) Short promo / bumper (Sandblast branding)\n\n` +
    `Next action: give me 3 candidate show titles you want inside this block.`
  );
}

function formatNewsCanada(userMessage = "", access = "public") {
  const safe = access !== "admin";
  return (
    `News Canada Placement Draft\n\n` +
    `Goal: turn stories into “broadcast-ready” moments.\n\n` +
    `Web:\n` +
    `- 1 headline + 2-line summary + “Why it matters”\n\n` +
    `Radio:\n` +
    `- 15–20 sec intro read + 1 punchline + CTA (“Read the full story on Sandblast”) \n\n` +
    `TV:\n` +
    `- Lower-third headline + 10 sec voiceover + 1 visual suggestion\n\n` +
    (safe ? `Note: public-safe framing only.\n\n` : `Admin note: we can A/B test headlines + measure CTR weekly.\n\n`) +
    `Next action: paste the story title (or first paragraph) and tell me: web, radio, TV—or all three.`
  );
}

module.exports = { buildSponsorPackage, buildTvBlock, formatNewsCanada };

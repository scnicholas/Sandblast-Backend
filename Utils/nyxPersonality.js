// Utils/nyxPersonality.js
// Nyx personality + domain-level refinements for Sandblast
// This file sits on top of the core brain in index.js

// Small helper
function toLower(str) {
  return (str || '').toLowerCase();
}

// -----------------------------
// 1. Front-door response (optional override)
// -----------------------------
function getFrontDoorResponse(message, meta) {
  const msg = toLower(message || '');

  // If user is clearly asking "what can you do" / about Sandblast,
  // give a slightly more conversational overview than the base reply.
  const aboutKeywords = [
    'what can you do',
    'how can you help',
    'what do you do',
    'who are you',
    'what is sandblast',
    'tell me about sandblast',
    'explain sandblast',
    'what is this channel'
  ];

  const isAboutNyxOrSandblast = aboutKeywords.some(k => msg.includes(k));

  if (!isAboutNyxOrSandblast) {
    // Let index.js handle generic cases normally
    return null;
  }

  return (
    `You’re talking to Nyx — the AI brain wired into Sandblast.\n\n` +
    `I can help you shape TV blocks, radio shows, sponsorship ideas, streaming plans, ` +
    `and even AI strategy and training for real-world organizations.\n\n` +
    `Tell me where you want to start: your content, your sponsors, or your AI questions.`
  );
}

// -----------------------------
// 2. Domain responses
// -----------------------------
function getDomainResponse(domain, message, meta) {
  const msg = toLower(message || '');

  switch (domain) {
    case 'tv':
      return handleTvDomain(msg, meta);
    case 'radio':
      return handleRadioDomain(msg, meta);
    case 'sponsors':
      return handleSponsorsDomain(msg, meta);
    case 'streaming':
      return handleStreamingDomain(msg, meta);
    case 'news_canada':
      return handleNewsCanadaDomain(msg, meta);
    case 'ai_consulting':
      return handleAiConsultingDomain(msg, meta);
    default:
      return null; // fall back to base reply from index.js
  }
}

// ---- TV ----
function handleTvDomain(msg, meta) {
  if (msg.includes('schedule') || msg.includes('grid') || msg.includes('lineup')) {
    return (
      `Let’s tune the TV schedule.\n\n` +
      `Think in blocks, not random shows: retro dramas, westerns, detective hours, themed nights, etc.\n\n` +
      `Give me one block you want to build — for example “Weeknight detective hour” or “Sunday afternoon westerns” — ` +
      `and I’ll help you shape the time slot and flow.`
    );
  }

  if (msg.includes('show') && msg.includes('promote')) {
    return (
      `You want to promote a TV show — good.\n\n` +
      `We can combine on-air mentions, lower-third graphics, and social media posts that echo the same hook.\n\n` +
      `Tell me the show name, the core hook (why someone should care), and when it airs, and I’ll outline a simple promo plan.`
    );
  }

  return null;
}

// ---- Radio ----
function handleRadioDomain(msg, meta) {
  if (msg.includes('gospel sunday') || msg.includes('gospel')) {
    return (
      `Gospel Sunday is a strong anchor for Sandblast Radio.\n\n` +
      `You can treat it as a weekly “appointment” block: recurring time, clear sound, and a consistent emotional feel.\n\n` +
      `Tell me if you want help with: playlist flow, segment ideas, or sponsor tie-ins for Gospel Sunday, and I’ll build around that.`
    );
  }

  if (msg.includes('playlist') || msg.includes('mix')) {
    return (
      `Let’s shape the radio sound.\n\n` +
      `Think about your playlist in arcs: open strong, keep a groove, then land the block with something memorable.\n\n` +
      `Tell me the mood (energizing, reflective, Sunday morning calm, etc.) and the length of the block, and I’ll suggest a simple structure.`
    );
  }

  return null;
}

// ---- Sponsors ----
function handleSponsorsDomain(msg, meta) {
  if (msg.includes('package') || msg.includes('media kit') || msg.includes('rate card')) {
    return (
      `Let’s keep sponsor packages realistic for a growing channel.\n\n` +
      `Instead of huge network bundles, think in simple tiers: starter, growth, and flagship.\n\n` +
      `Tell me your ideal sponsor type (local business, regional brand, nonprofit, etc.) and your rough monthly value target, ` +
      `and I’ll outline a 2–3 tier package structure you can refine.`
    );
  }

  if (msg.includes('how do i advertise') || msg.includes('place an ad') || msg.includes('run my ad')) {
    return (
      `To advertise on Sandblast, the flow is simple:\n\n` +
      `1) Clarify your goal (brand awareness, traffic, or direct response).\n` +
      `2) Match that goal to TV, radio, or streaming placements.\n` +
      `3) Pick a realistic starting budget and a short test period (4–6 weeks).\n\n` +
      `Tell me your business type and your primary goal, and I’ll suggest a simple test campaign layout.`
    );
  }

  return null;
}

// ---- Streaming ----
function handleStreamingDomain(msg, meta) {
  if (msg.includes('roku') || msg.includes('ott') || msg.includes('app')) {
    return (
      `For streaming and OTT, keep the stack lean at this stage.\n\n` +
      `You want a reliable pipeline from your content library into one or two key destinations (like an app or a web player), ` +
      `instead of trying to be everywhere at once.\n\n` +
      `Tell me what you have now — files on a drive, a web player, a Roku idea — and I’ll help you think about the next practical step.`
    );
  }

  if (msg.includes('upload') || msg.includes('watch online') || msg.includes('on demand')) {
    return (
      `On-demand viewing is where a lot of your audience will actually discover you.\n\n` +
      `We can group content into collections (westerns, detective shows, gospel music, etc.) so people can browse by mood or theme.\n\n` +
      `Tell me which category you want to prioritize first, and I’ll help you think through how to present it.`
    );
  }

  return null;
}

// ---- News Canada ----
function handleNewsCanadaDomain(msg, meta) {
  if (msg.includes('where') && msg.includes('run')) {
    return (
      `News Canada pieces work best when they feel like a natural editorial fit, not just an add-on.\n\n` +
      `You can use them as short segments between shows, or as part of a themed block that matches the topic (health, finance, lifestyle, etc.).\n\n` +
      `Tell me the topic of the News Canada piece, and I’ll suggest where it fits best in TV, radio, or streaming.`
    );
  }

  if (msg.includes('sponsor') || msg.includes('tie in') || msg.includes('align')) {
    return (
      `You can align a sponsor with a News Canada piece by matching their brand to the story’s theme.\n\n` +
      `For example: a financial institution with a money-management feature, or a health brand with a wellness clip.\n\n` +
      `Tell me the sponsor type and the News Canada theme, and I’ll outline one or two ways to connect them.`
    );
  }

  return null;
}

// ---- AI Consulting (with Employment Ontario focus) ----
function handleAiConsultingDomain(msg, meta) {
  const mentionsEmploymentOntario =
    msg.includes('employment ontario') ||
    msg.includes('employment center') ||
    msg.includes('employment centre') ||
    msg.includes('job seekers') ||
    msg.includes('job-seekers') ||
    msg.includes('workforce') ||
    msg.includes('career centre') ||
    msg.includes('career center');

  if (mentionsEmploymentOntario) {
    return (
      `You’re talking about AI in an Employment Ontario context — that’s a strong use case.\n\n` +
      `Here’s a clean way to frame it:\n` +
      `- Focus: Use AI to help job seekers with resumes, cover letters, interview prep, and basic digital skills.\n` +
      `- Safety: Keep it practical, transparent, and focused on *supporting* staff, not replacing them.\n` +
      `- Outcome: Faster, better-quality applications and more confident clients walking into interviews.\n\n` +
      `Next action: Tell me how long your session or meeting is and who will be in the room (front-line staff, managers, or partners). ` +
      `I’ll help you outline 3–5 talking points and one simple demo you can walk them through.`
    );
  }

  // General AI consulting, not specifically Employment Ontario
  if (msg.includes('training') || msg.includes('workshop') || msg.includes('course') || msg.includes('bootcamp')) {
    return (
      `You’re in AI training territory — good.\n\n` +
      `A strong session usually has three parts: clarity (what AI is and isn’t), safety (what to avoid), and hands-on practice (how to actually use it).\n\n` +
      `Tell me your audience (staff, leaders, job seekers, small businesses) and your session length, and I’ll suggest a simple structure with 3–4 outcomes.`
    );
  }

  if (msg.includes('strategy') || msg.includes('roadmap') || msg.includes('road map')) {
    return (
      `You’re thinking about AI strategy.\n\n` +
      `We don’t need a 60-page document. We need a short roadmap that answers:\n` +
      `1) What problems are we solving?\n` +
      `2) What tools are realistic at our size?\n` +
      `3) How do we train people to use them safely?\n\n` +
      `Tell me the type of organization (public, nonprofit, small business, etc.) and one problem you want AI to help with, and I’ll sketch a simple path.`
    );
  }

  return null;
}

// -----------------------------
// 3. Enricher (older payload style) – optional
// -----------------------------
function enrichDomainResponse(message, payload) {
  // For now, just pass through; index.js already has strong copy.
  // You could add light add-ons here later if needed.
  return payload;
}

// -----------------------------
// 4. Tone wrapper – keep it aligned with Nyx’s broadcast feel
// -----------------------------
function wrapWithNyxTone(baseReply, meta) {
  const tone = meta?.toneHint || 'neutral';
  let opener = '';

  switch (tone) {
    case 'low':
      opener = `Let’s take this one step at a time.\n\n`;
      break;
    case 'excited':
      opener = `Okay, I like the energy here.\n\n`;
      break;
    case 'confused':
      opener = `No problem — we can make this clearer.\n\n`;
      break;
    case 'help_seeking':
      opener = `You’re not bothering me — this is exactly what I’m here for.\n\n`;
      break;
    default:
      opener = '';
  }

  if (!opener) return baseReply;
  return `${opener}${baseReply}`;
}

module.exports = {
  getFrontDoorResponse,
  getDomainResponse,
  enrichDomainResponse,
  wrapWithNyxTone
};

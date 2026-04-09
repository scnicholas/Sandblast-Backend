// Utils/intentClassifier.js
// Intent + domain classifier for Nyx
// Operational Intelligence upgrade: confidence routing + clarification minimization
// Backward compatible: exports classifyIntent(message) AND classify(message, context)

"use strict";

function norm(message) {
  if (!message || typeof message !== "string") return "";
  return message.trim().toLowerCase();
}
function hitCount(text, patterns) {
  if (!text) return 0;
  return patterns.reduce((count, p) => !p ? count : (text.includes(p) ? count + 1 : count), 0);
}
function rx(text, re) { return !!text && re.test(text); }
function safeStr(x) { return x === null || x === undefined ? "" : String(x); }
function clamp(n, a, b){ n = Number(n); if (!Number.isFinite(n)) n = a; return Math.max(a, Math.min(b, n)); }
function uniq(arr){ return Array.from(new Set(Array.isArray(arr) ? arr : [])); }
function splitWords(t){ return norm(t).replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean); }

function extractYear(t) {
  if (!t) return null;
  const m = t.match(/\b(19\d{2}|20\d{2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

function getContextSignals(context) {
  const ctx = context && typeof context === "object" ? context : {};
  const payload = ctx.payload && typeof ctx.payload === "object" ? ctx.payload : {};
  const client = ctx.client && typeof ctx.client === "object" ? ctx.client : {};
  const lane = safeStr(payload.lane || ctx.lane || ctx.domain || "").trim().toLowerCase();
  const action = safeStr(payload.action || payload.intent || payload.mode || ctx.action || ctx.intent || "").trim().toLowerCase();
  const label = safeStr(payload.label || ctx.label || "").trim().toLowerCase();
  const routeHint = safeStr(ctx.routeHint || client.routeHint || "").trim().toLowerCase();
  const year = Number(payload.year || ctx.year) || extractYear(label) || extractYear(action) || extractYear(routeHint) || null;
  const signalText = norm([lane, action, label, routeHint, year ? String(year) : ""].filter(Boolean).join(" "));
  return { lane, action, label, routeHint, year:Number.isFinite(year)?year:null, signalText };
}

function getMemorySignals(context){
  const ctx = context && typeof context === 'object' ? context : {};
  const mw = ctx.memoryWindows && typeof ctx.memoryWindows === 'object' ? ctx.memoryWindows : (ctx.memory && ctx.memory.memoryWindows && typeof ctx.memory.memoryWindows === 'object' ? ctx.memory.memoryWindows : {});
  const recentIntents = Array.isArray(mw.recentIntents) ? mw.recentIntents.map(x=>safeStr(x).toLowerCase()) : [];
  const unresolvedAsks = Array.isArray(mw.unresolvedAsks) ? mw.unresolvedAsks.map(x=>safeStr(x)) : [];
  const lastResolvedIntent = safeStr(mw.lastResolvedIntent || ctx.lastResolvedIntent || "").toLowerCase();
  const lastUserPreference = mw.lastUserPreference && typeof mw.lastUserPreference === 'object' ? mw.lastUserPreference : (ctx.lastUserPreference && typeof ctx.lastUserPreference === 'object' ? ctx.lastUserPreference : null);
  return { recentIntents, unresolvedAsks, lastResolvedIntent, lastUserPreference };
}

function detectMusicAction(t, contextSignals) {
  const s = contextSignals && contextSignals.signalText ? contextSignals.signalText : "";
  const x = t || "";
  const wantsTop10 = rx(x,/\b(top\s*10|top10|ten\s+best)\b/) || rx(s,/\b(top\s*10|top10)\b/);
  const wantsTop40 = rx(x,/\b(top\s*40|top40)\b/) || rx(s,/\b(top\s*40|top40)\b/);
  const wantsYearEnd = rx(x,/\b(year[-\s]*end|yearend)\b/) || rx(s,/\b(year[-\s]*end|yearend)\b/);
  const wantsCharts = rx(x,/\b(chart|charts|charting|hit\s*parade|weekly\s*chart|billboard|hot\s*100)\b/) || rx(s,/\b(chart|charts|billboard|hot\s*100)\b/);
  const wantsNumberOne = rx(x,/\b(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1|no1)\b/) || rx(s,/\b(#\s*1|#1|number\s*one|no\.\s*1|no\s*1|no1)\b/);
  const wantsStory = rx(x,/\b(story\s*moment|story|moment|what\s+was\s+happening|behind\s+it|tell\s+me\s+more)\b/) || rx(s,/\b(story\s*moment|story|moment)\b/);
  if (wantsTop10) return "top10";
  if (wantsTop40) return "top40";
  if (wantsYearEnd) return "year_end";
  if (wantsNumberOne) return "number_one";
  if (wantsCharts) return "charts";
  if (wantsStory) return "story_moment";
  return null;
}

function detectMusicHistoryIntent(t, contextSignals) {
  const hasChartSignals =
    rx(t,/\b(hot\s*100|billboard|top\s*40|top40|top\s*10|top10|chart|charts|charting|hit\s*parade|weekly\s*chart|year[-\s]*end)\b/) ||
    rx(t,/\b(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1|no1)\b/) ||
    rx(t,/\b(weeks?\s+at\s+(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1))\b/) ||
    rx(t,/\b(peak|peaked|debut)\b/);
  const hasFollowupSignals = rx(t,/\b(another|next|one more|more like this|surprise|random|tell me more|behind it|keep going)\b/);
  const hasLightMusicHints = rx(t,/\b(song|artist|single|album|track|lyrics|band)\b/) || rx(t,/\b(198\d|199\d|197\d|200\d|201\d|202\d)\b/);
  const cs = contextSignals && contextSignals.signalText ? contextSignals.signalText : "";
  const contextSuggestsMusic = rx(cs,/\b(music|chart|charts|top10|top\s*10|hot\s*100|billboard)\b/);
  return hasChartSignals || contextSuggestsMusic || (hasFollowupSignals && hasLightMusicHints);
}

function detectRepairIntent(t) {
  return (
    rx(t,/\b(still\s+loops?|looping|stuck|frozen|did(n't| not)\s+work|not\s+working|broken|bug|crash|error)\b/) ||
    rx(t,/\b(cannot\s+get|can't\s+get)\b/) ||
    rx(t,/\b(404|500|502|503|504)\b/) ||
    rx(t,/\/api\/(health|chat|debug\/last)\b/) ||
    rx(t,/\b(no\s+reply|not\s+responding|won't\s+send|can't\s+send)\b/)
  );
}

const GREETINGS=["hi","hello","hey","good morning","good afternoon","good evening","greetings"];
const SMALLTALK=["how are you","how's your day","hows your day","how is your day","what's up","whats up","how you doing","how are things","how is it going","how's it going"];

function classifyPrimaryIntent(text, contextSignals, memorySignals) {
  if (!text) {
    const ctxAction = detectMusicAction("", contextSignals);
    if (ctxAction) return { primaryIntent:"exploratory", confidence:0.75 };
    return { primaryIntent:"conversational", confidence:0.35 };
  }
  if (detectRepairIntent(text)) return { primaryIntent:"repair", confidence:0.92 };
  if (detectMusicHistoryIntent(text, contextSignals)) {
    const directiveSignals = rx(text,/\b(give me|show me|pull up|fetch|generate|run|test|update|resend|fix|deploy|build|create)\b/);
    return { primaryIntent:directiveSignals?"directive":"exploratory", confidence:0.92 };
  }
  const isGreeting = GREETINGS.some((w)=>text===w||text.startsWith(w+" ")) || (text.length<=30 && GREETINGS.some((w)=>text.includes(w)));
  if (isGreeting) return { primaryIntent:"conversational", confidence:0.9 };
  if (SMALLTALK.some((p)=>text.includes(p))) return { primaryIntent:"conversational", confidence:0.9 };
  if (rx(text,/^\s*(help|fix|update|resend|deploy|build|create|generate|show)\b/) || rx(text,/\b(can you|please)\b/) || rx(text,/\b(update\s+index\.js|update\s+widget|resend\s+full|send\s+full)\b/)) {
    return { primaryIntent:"directive", confidence:0.78 };
  }
  if (text.endsWith("?") || rx(text,/^\s*(what|when|why|how|where|who)\b/)) return { primaryIntent:"exploratory", confidence:0.72 };

  // Memory bias: if we are clearly continuing an unresolved thread, push upward a bit.
  if (memorySignals && memorySignals.unresolvedAsks.length) {
    const u = memorySignals.unresolvedAsks[memorySignals.unresolvedAsks.length - 1];
    if (u && splitWords(u).some(w => splitWords(text).includes(w))) {
      return { primaryIntent:"exploratory", confidence:0.7 };
    }
  }
  return { primaryIntent:"exploratory", confidence:0.55 };
}

function classifyDomain(text, primaryIntent, contextSignals, musicAction, memorySignals) {
  const techSignals=["error","bug","crash","stack trace","render.com","render ","webflow","api","endpoint","index.js","server","deploy","deployment","cannot get","cors","timeout","tts","backend","rebase","git","push","pull","commit"];
  const aiSignals=["ai","artificial intelligence","chatgpt","prompt","prompts","openai","model","llm","automation","agent","agents"];
  const sponsorSignals=["sponsor","sponsorship","sponsored","advertiser","advertising","ad spot","ad spots","ad package","ad packages","rate card","rates","campaign"];
  const tvSignals=["tv","television","episode","show","series","schedule","programming","lineup","time slot","timeslot","block","channel","western","detective","sitcom"];
  const radioSignals=["radio","dj nova","dj","playlist","audio block","music block","rotation","on air","on-air"];
  const businessSignals=["grant","funding","revenue","sales","business plan","cash flow","cashflow","pitch","client","proposal","pricing","monetize","monetization","roi","growth"];
  const novaSignals=["nova","dj nova","nova intro","nova voice"];
  const musicSignals=["billboard","hot 100","top 40","top40","top 10","top10","chart","charts","#1","# 1","number one","number 1","no. 1","no 1","no1","peak","debut","weeks at","year-end","year end","weekly chart","hit parade","song","artist","single","album","track","story moment"];

  const techHits=hitCount(text,techSignals), aiHits=hitCount(text,aiSignals), sponsorHits=hitCount(text,sponsorSignals), radioHits=hitCount(text,radioSignals), tvHits=hitCount(text,tvSignals), businessHits=hitCount(text,businessSignals), novaHits=hitCount(text,novaSignals), musicHits=hitCount(text,musicSignals);
  const cs=contextSignals&&contextSignals.signalText?contextSignals.signalText:"";
  const ctxMusicHits=cs?hitCount(cs,musicSignals):0;
  const prefLane = memorySignals && memorySignals.lastUserPreference && memorySignals.lastUserPreference.lane ? safeStr(memorySignals.lastUserPreference.lane).toLowerCase() : "";

  if (primaryIntent === "repair" && techHits > 0) return { domain:"tech_support", domainConfidence:0.9 };
  if (techHits > 0) return { domain:"tech_support", domainConfidence:Math.min(0.85 + techHits * 0.03, 0.95) };
  if (musicAction || musicHits > 0 || ctxMusicHits > 0 || detectMusicHistoryIntent(text, contextSignals)) return { domain:"music_history", domainConfidence:Math.min(0.86 + (musicHits + ctxMusicHits) * 0.02, 0.95) };
  if (aiHits > 0) return { domain:"ai_help", domainConfidence:Math.min(0.8 + aiHits * 0.03, 0.93) };
  if (sponsorHits > 0) return { domain:"sponsors", domainConfidence:Math.min(0.8 + sponsorHits * 0.03, 0.93) };
  if (radioHits > 0 && novaHits > 0) return { domain:"nova", domainConfidence:0.85 };
  if (radioHits > 0) return { domain:"radio", domainConfidence:0.78 };
  if (novaHits > 0) return { domain:"nova", domainConfidence:0.65 };
  if (tvHits > 0) return { domain:"tv", domainConfidence:0.78 };
  if (businessHits > 0) return { domain:"business_support", domainConfidence:0.72 };
  if (prefLane === 'music') return { domain:'music_history', domainConfidence:0.56 };
  return { domain:"general", domainConfidence:0.25 };
}

function computeNeedsFollowUp(text, primaryIntent, domain, musicAction, musicYear) {
  if (!text && !musicAction) return true;
  if (primaryIntent === "repair" || domain === "tech_support") {
    const hasConcrete = rx(text,/\b(404|500|502|503|504|429)\b/) || rx(text,/\/api\/[a-z0-9/_-]+/i) || rx(text,/\b(render|webflow|cors|endpoint|index\.js|log|stack trace)\b/);
    return !hasConcrete;
  }
  if (domain === "music_history") {
    if (musicAction && musicAction !== "story_moment") return !musicYear;
    const hasAnchor = !!musicYear || rx(text,/\b(song|artist|title)\b/) || rx(text,/\b(#1|number one|hot 100|billboard|top 40|top40|top 10|top10)\b/);
    return !hasAnchor;
  }
  return false;
}

function computeAmbiguity(text, primaryIntent, domain, musicAction, musicYear, contextSignals){
  let score = 0.15;
  const words = splitWords(text);
  if (!words.length && !musicAction) score += 0.35;
  if (words.length <= 3 && primaryIntent !== 'conversational') score += 0.22;
  if (domain === 'general') score += 0.18;
  if (domain === 'music_history' && musicAction && musicAction !== 'story_moment' && !musicYear) score += 0.28;
  if (primaryIntent === 'directive' && !rx(text,/\b(show|fix|build|update|create|resend|deploy|generate)\b/)) score += 0.12;
  if (contextSignals && contextSignals.signalText && words.length && !splitWords(contextSignals.signalText).some(w=>words.includes(w))) score += 0.08;
  return clamp(score, 0, 1);
}

function computeRouteConfidence(primaryConfidence, domainConfidence, ambiguity, memorySignals){
  let rc = (primaryConfidence * 0.44) + (domainConfidence * 0.44) + ((1 - ambiguity) * 0.12);
  if (memorySignals && memorySignals.unresolvedAsks.length) rc += 0.04;
  if (memorySignals && memorySignals.lastResolvedIntent) rc += 0.02;
  return clamp(rc, 0, 1);
}

function buildMinimalClarifier(domain, musicAction, musicYear, text){
  if (domain === 'music_history' && musicAction && !musicYear) {
    return 'Do you want a specific year for that chart request, or should I pick one?';
  }
  if (domain === 'tech_support') {
    return 'Do you want the direct fix, or do you want me to diagnose the cause first?';
  }
  if (domain === 'business_support') {
    return 'Are you looking for strategy, funding direction, or a draft you can use right away?';
  }
  if (text && splitWords(text).length <= 4) {
    return 'Do you want the fast answer, or a more detailed breakdown?';
  }
  return 'Do you want the direct answer, or should I narrow this down with one focused option first?';
}

function chooseNextAction(routeConfidence, ambiguity, needsFollowUp){
  if (routeConfidence >= 0.78 && ambiguity <= 0.34) return 'answer';
  if (needsFollowUp || ambiguity >= 0.45 || routeConfidence < 0.65) return 'clarify';
  return 'answer';
}

function classifyIntent(message) {
  const text = norm(message);
  const contextSignals = getContextSignals(null);
  const memorySignals = getMemorySignals(null);
  const musicYear = extractYear(text);
  const musicAction = detectMusicAction(text, contextSignals);
  const { primaryIntent, confidence: primaryConfidence } = classifyPrimaryIntent(text, contextSignals, memorySignals);
  let intent = 'statement', confidence = 0.5;
  if (!text) { intent='statement'; confidence=0.3; }
  else if (primaryIntent === 'repair') { intent='repair'; confidence=0.92; }
  else if (detectMusicHistoryIntent(text, contextSignals)) { intent='music_history'; confidence=0.92; }
  else if (primaryIntent === 'conversational') {
    const isGreeting = GREETINGS.some((w)=>text===w||text.startsWith(w+" ")) || (text.length<=30 && GREETINGS.some((w)=>text.includes(w)));
    intent = isGreeting ? 'greeting' : 'smalltalk'; confidence = 0.9;
  } else if (primaryIntent === 'directive') { intent='help_request'; confidence=0.75; }
  else if (text.endsWith('?')) { intent='question'; confidence=0.65; }
  else { intent='statement'; confidence=0.55; }

  const { domain, domainConfidence } = classifyDomain(text, primaryIntent, contextSignals, musicAction, memorySignals);
  const needsFollowUp = computeNeedsFollowUp(text, primaryIntent, domain, musicAction, musicYear);
  const ambiguity = computeAmbiguity(text, primaryIntent, domain, musicAction, musicYear, contextSignals);
  const routeConfidence = computeRouteConfidence(primaryConfidence, domainConfidence, ambiguity, memorySignals);
  return { primaryIntent, primaryConfidence, domain, intent, confidence, domainConfidence, needsFollowUp, musicAction:musicAction||null, musicYear:musicYear||null, ambiguity, routeConfidence, clarifier:buildMinimalClarifier(domain, musicAction, musicYear, text), nextAction:chooseNextAction(routeConfidence, ambiguity, needsFollowUp) };
}

function classify(message, context) {
  const text = norm(message);
  const contextSignals = getContextSignals(context);
  const memorySignals = getMemorySignals(context);
  const textYear = extractYear(text), ctxYear = contextSignals.year;
  const ctxAction = detectMusicAction("", contextSignals), textAction = detectMusicAction(text, contextSignals);
  const musicAction = ctxAction || textAction || null;
  const musicYear = textYear || ctxYear || null;
  const { primaryIntent, confidence: primaryConfidence } = classifyPrimaryIntent(text, contextSignals, memorySignals);

  let legacyIntent='statement', legacyConfidence=0.5;
  if (!text && !musicAction) { legacyIntent='statement'; legacyConfidence=0.3; }
  else if (primaryIntent === 'repair') { legacyIntent='repair'; legacyConfidence=0.92; }
  else if (detectMusicHistoryIntent(text, contextSignals) || !!musicAction) { legacyIntent='music_history'; legacyConfidence=0.92; }
  else if (primaryIntent === 'conversational') {
    const isGreeting = GREETINGS.some((w)=>text===w||text.startsWith(w+" ")) || (text.length<=30 && GREETINGS.some((w)=>text.includes(w)));
    legacyIntent = isGreeting ? 'greeting' : 'smalltalk'; legacyConfidence=0.9;
  } else if (primaryIntent === 'directive') { legacyIntent='help_request'; legacyConfidence=0.75; }
  else if (text.endsWith('?')) { legacyIntent='question'; legacyConfidence=0.65; }
  else { legacyIntent='statement'; legacyConfidence=0.55; }

  const { domain, domainConfidence } = classifyDomain(text, primaryIntent, contextSignals, musicAction, memorySignals);
  const needsFollowUp = computeNeedsFollowUp(text, primaryIntent, domain, musicAction, musicYear);
  const ambiguity = computeAmbiguity(text, primaryIntent, domain, musicAction, musicYear, contextSignals);
  const routeConfidence = computeRouteConfidence(primaryConfidence, domainConfidence, ambiguity, memorySignals);
  const clarifier = buildMinimalClarifier(domain, musicAction, musicYear, text);
  const nextAction = chooseNextAction(routeConfidence, ambiguity, needsFollowUp);

  return {
    primary: primaryIntent,
    confidence: primaryConfidence,
    domain,
    domainConfidence,
    needsFollowUp,
    legacyIntent,
    legacyConfidence,
    musicAction,
    musicYear,
    ambiguity,
    routeConfidence,
    clarifier,
    nextAction,
    context: context || null,
    contextSignals,
    memorySignals,
    preferredLane: memorySignals && memorySignals.lastUserPreference ? safeStr(memorySignals.lastUserPreference.lane || '').toLowerCase() : ''
  };
}

const INTENT_CLASSIFIER_VERSION = "intentClassifier v1.0.1 YEAR-WIDENED-PIPELINE-NORMALIZED";

module.exports = { classifyIntent, classify, extractYear, INTENT_CLASSIFIER_VERSION };

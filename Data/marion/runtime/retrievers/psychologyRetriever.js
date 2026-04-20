"use strict";

const fs = require("fs");
const path = require("path");

const VERSION = "psychologyRetriever v2.1.0 HARDENED-INTEGRATION-READY";
const FILE_NAME = "psychologyRetriever.js";

let _cache = {
  compiledPath: "",
  routeMapPath: "",
  supportMapPath: "",
  compiledMtime: 0,
  routeMapMtime: 0,
  supportMapMtime: 0,
  compiled: null,
  routeMap: null,
  supportMap: null
};

function _exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function _mtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs || 0;
  } catch {
    return 0;
  }
}

function _readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function _safeArray(value) { return Array.isArray(value) ? value : []; }
function _safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function _str(value) { return value == null ? "" : String(value); }
function _trim(value) { return _str(value).trim(); }
function _lower(value) { return _trim(value).toLowerCase(); }
function _clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function _tokenize(text) {
  return _lower(text)
    .replace(/[^a-z0-9\s'’-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function _normalizeText(text) {
  return _tokenize(text).join(" ");
}

function _uniqStrings(values) {
  return [...new Set(_safeArray(values).map((v) => _trim(v)).filter(Boolean))];
}

function _candidateRoots() {
  const roots = [
    path.resolve(__dirname),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", ".."),
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), "psychology"),
    path.resolve(process.cwd(), "data"),
    path.resolve(process.cwd(), "datasets")
  ];
  return [...new Set(roots)];
}

function _findCompiledPath() {
  const candidates = [];
  for (const root of _candidateRoots()) {
    candidates.push(path.join(root, "compiled", "psychology_compiled.json"));
    candidates.push(path.join(root, "psychology", "compiled", "psychology_compiled.json"));
    candidates.push(path.join(root, "psychology_compiled.json"));
  }
  return candidates.find(_exists) || "";
}

function _findRouteMapPath() {
  const candidates = [];
  for (const root of _candidateRoots()) {
    candidates.push(path.join(root, "maps", "psychology_route_map.json"));
    candidates.push(path.join(root, "psychology", "maps", "psychology_route_map.json"));
    candidates.push(path.join(root, "psychology_route_map.json"));
  }
  return candidates.find(_exists) || "";
}

function _findSupportMapPath() {
  const candidates = [];
  for (const root of _candidateRoots()) {
    candidates.push(path.join(root, "maps", "psychology_support_map.json"));
    candidates.push(path.join(root, "psychology", "maps", "psychology_support_map.json"));
    candidates.push(path.join(root, "psychology_support_map.json"));
  }
  return candidates.find(_exists) || "";
}

function _loadCompiled() {
  const filePath = _findCompiledPath();
  if (!filePath) return { records: [], retrievalPolicy: {}, sourceFiles: [] };
  const mtime = _mtime(filePath);
  if (!_cache.compiled || _cache.compiledPath !== filePath || _cache.compiledMtime !== mtime) {
    _cache.compiled = _safeObj(_readJson(filePath));
    _cache.compiledPath = filePath;
    _cache.compiledMtime = mtime;
  }
  return _cache.compiled;
}

function _loadRouteMap() {
  const filePath = _findRouteMapPath();
  if (!filePath) return { defaultRoute: {}, routingRules: [] };
  const mtime = _mtime(filePath);
  if (!_cache.routeMap || _cache.routeMapPath !== filePath || _cache.routeMapMtime !== mtime) {
    _cache.routeMap = _safeObj(_readJson(filePath));
    _cache.routeMapPath = filePath;
    _cache.routeMapMtime = mtime;
  }
  return _cache.routeMap;
}

function _loadSupportMap() {
  const filePath = _findSupportMapPath();
  if (!filePath) return { supportModes: {} };
  const mtime = _mtime(filePath);
  if (!_cache.supportMap || _cache.supportMapPath !== filePath || _cache.supportMapMtime !== mtime) {
    _cache.supportMap = _safeObj(_readJson(filePath));
    _cache.supportMapPath = filePath;
    _cache.supportMapMtime = mtime;
  }
  return _cache.supportMap;
}

function _containsPhrase(haystack, phrase) {
  const h = _normalizeText(haystack);
  const p = _normalizeText(phrase);
  return !!p && h.includes(p);
}

function _flattenStrings(value, out = []) {
  if (typeof value === "string") {
    const s = _trim(value);
    if (s) out.push(s);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) _flattenStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) _flattenStrings(item, out);
    return out;
  }
  return out;
}

function _scoreMatch(normalizedText, record) {
  const reasons = [];
  let score = 0;
  const signals = _safeArray(record.signals);
  const keywords = _safeArray(record.keywords);
  const triggers = _safeArray(record.triggers);
  const topic = _trim(record.topic);
  const title = _trim(record.title);

  for (const signal of signals) {
    if (_containsPhrase(normalizedText, signal)) {
      score += 6;
      reasons.push({ type: "signal", value: signal, weight: 6 });
    }
  }
  for (const keyword of keywords) {
    if (_containsPhrase(normalizedText, keyword)) {
      score += 4;
      reasons.push({ type: "keyword", value: keyword, weight: 4 });
    }
  }
  for (const trigger of triggers) {
    if (_containsPhrase(normalizedText, trigger)) {
      score += 3;
      reasons.push({ type: "trigger", value: trigger, weight: 3 });
    }
  }
  if (topic && _containsPhrase(normalizedText, topic.replace(/_/g, " "))) {
    score += 2;
    reasons.push({ type: "topic", value: topic, weight: 2 });
  }
  if (title && _containsPhrase(normalizedText, title)) {
    score += 2;
    reasons.push({ type: "title", value: title, weight: 2 });
  }

  const risk = _lower(record.riskLevel);
  if (risk === "critical") score += 8;
  else if (risk === "high") score += 4;
  else if (risk === "moderate") score += 1;

  return { score, reasons };
}

function _matchesSupportFlags(ruleFlags, actualFlags) {
  const required = _safeObj(ruleFlags);
  const actual = _safeObj(actualFlags);
  for (const [key, value] of Object.entries(required)) {
    if (!!actual[key] !== !!value) return false;
  }
  return true;
}

function _matchesKeywordsAny(ruleKeywords, text) {
  const keywords = _safeArray(ruleKeywords);
  if (!keywords.length) return true;
  return keywords.some((keyword) => _containsPhrase(text, keyword));
}

function _matchesRisk(ruleRisk, actualRisk) {
  if (!Array.isArray(ruleRisk) || !ruleRisk.length) return true;
  return ruleRisk.map(_lower).includes(_lower(actualRisk));
}

function _applyRouteRules(input, records) {
  const routeMap = _loadRouteMap();
  const normalizedText = _trim(input.text);
  const supportFlags = _safeObj(input.supportFlags);
  const riskLevel = _lower(input.riskLevel);

  for (const rule of _safeArray(routeMap.routingRules)) {
    const when = _safeObj(rule.when);
    const okFlags = _matchesSupportFlags(when.supportFlags, supportFlags);
    const okKeywords = _matchesKeywordsAny(when.keywordsAny, normalizedText);
    const okRisk = _matchesRisk(when.riskLevel, riskLevel);

    if (okFlags && okKeywords && okRisk) {
      const routeTo = _safeObj(rule.routeTo);
      const primary = _trim(routeTo.primarySubdomain);
      const secondary = _safeArray(routeTo.secondarySubdomains).map(_trim).filter(Boolean);
      const prioritized = records.slice().sort((a, b) => {
        const aPrimary = a.subdomain === primary ? 1 : 0;
        const bPrimary = b.subdomain === primary ? 1 : 0;
        if (aPrimary !== bPrimary) return bPrimary - aPrimary;
        const aSecondary = secondary.includes(a.subdomain) ? 1 : 0;
        const bSecondary = secondary.includes(b.subdomain) ? 1 : 0;
        if (aSecondary !== bSecondary) return bSecondary - aSecondary;
        return 0;
      });
      return { ruleId: rule.id || null, routeTo, records: prioritized };
    }
  }

  return {
    ruleId: null,
    routeTo: _safeObj(routeMap.defaultRoute),
    records
  };
}

function _enrichSupportMode(record) {
  const supportModes = _safeObj(_loadSupportMap().supportModes);
  const mode = _trim(record.supportMode);
  return _safeObj(supportModes[mode]);
}

function _pickTopMatches(scored, maxMatches) {
  return _safeArray(scored)
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const order = { critical: 4, high: 3, moderate: 2, low: 1 };
      return (order[_lower(b.record.riskLevel)] || 0) - (order[_lower(a.record.riskLevel)] || 0);
    })
    .slice(0, maxMatches);
}

function _deriveRiskLevel(input, primary) {
  const explicit = _trim(input.riskLevel);
  if (explicit) return _lower(explicit);
  const emotion = _safeObj(input.emotion);
  const supportFlags = _safeObj(input.supportFlags);
  if (supportFlags.crisis) return "critical";
  if (supportFlags.needsContainment || supportFlags.highDistress) return "high";
  if ((_clamp01(emotion.intensity, 0)) >= 0.7) return "high";
  if ((_clamp01(emotion.intensity, 0)) >= 0.45) return "moderate";
  if (primary && primary.record && primary.record.riskLevel) return _lower(primary.record.riskLevel);
  return "low";
}

function _derivePatterns(primary, matches, route) {
  const values = [];
  if (route && route.primarySubdomain) values.push(route.primarySubdomain);
  for (const match of _safeArray(matches)) {
    const record = _safeObj(match.record);
    values.push(record.topic, record.subdomain, record.title);
  }
  return _uniqStrings(values).slice(0, 8);
}

function _deriveRisks(primary, riskLevel, supportFlags) {
  const values = [];
  const record = _safeObj(primary && primary.record);
  values.push(record.riskLevel, ..._safeArray(record.riskFlags), ..._safeArray(record.risks));
  if (_safeObj(supportFlags).highDistress) values.push("high_distress");
  if (_safeObj(supportFlags).needsContainment) values.push("containment");
  if (_safeObj(supportFlags).needsStabilization) values.push("stabilization");
  if (_safeObj(supportFlags).suppressionPresent) values.push("suppression_present");
  if (riskLevel) values.push(riskLevel);
  return _uniqStrings(values);
}

function _deriveNeeds(primary, supportFlags, emotion) {
  const record = _safeObj(primary && primary.record);
  const values = [];
  values.push(..._safeArray(record.needs), ..._safeArray(record.responseNeeds));
  if (_safeObj(supportFlags).needsStabilization) values.push("stabilization");
  if (_safeObj(supportFlags).needsContainment) values.push("containment");
  if (_safeObj(supportFlags).needsConnection) values.push("connection");
  if (_safeObj(supportFlags).needsClarification) values.push("clarity");
  if (_safeObj(supportFlags).forcedPositivity || _safeObj(supportFlags).minimization) values.push("gentle_probe");
  const primaryEmotion = _lower(_safeObj(emotion).primaryEmotion);
  if (["fear", "panic", "anxiety"].includes(primaryEmotion)) values.push("grounding");
  if (["sadness", "grief", "loneliness"].includes(primaryEmotion)) values.push("reassurance");
  if (["confusion", "uncertainty", "overwhelm"].includes(primaryEmotion)) values.push("orientation");
  return _uniqStrings(values);
}

function _deriveRecommendedApproach(route, primary, riskLevel, emotion, supportFlags) {
  const routeObj = _safeObj(route);
  const record = _safeObj(primary && primary.record);
  const explicit = _trim(routeObj.supportMode || record.supportMode || record.responseMode || record.approach);
  if (explicit) return explicit;
  if (_safeObj(supportFlags).suppressionPresent) return "validation_then_soft_probe";
  if (riskLevel === "critical" || riskLevel === "high") return "supportive-directive";
  if ((_clamp01(_safeObj(emotion).intensity, 0)) >= 0.6) return "supportive-containment";
  return "supportive";
}

function _deriveToneGuide(primary, supportProfile, emotion, route, supportFlags) {
  const record = _safeObj(primary && primary.record);
  const profile = _safeObj(supportProfile);
  const routeBias = _trim(_safeObj(route).routeBias);
  const explicit = _trim(profile.toneGuide || record.toneGuide || record.tone || record.voiceStyle);
  if (explicit) return explicit;
  if (_safeObj(supportFlags).suppressionPresent) return "gentle and non-intrusive";
  if (routeBias) return routeBias;
  if ((_clamp01(_safeObj(emotion).intensity, 0)) >= 0.6) return "warm and steady";
  return "balanced";
}

function _responsePlan(primary, supportProfile, route, supportFlags, emotion) {
  const profile = _safeObj(supportProfile);
  const record = _safeObj(primary && primary.record);
  const routeObj = _safeObj(route);
  const transitionTargets = _uniqStrings([
    ..._safeArray(profile.transitionTargets),
    ..._safeArray(routeObj.secondarySubdomains),
    _trim(routeObj.routeBias)
  ]);

  const responseShape = _uniqStrings([
    ..._flattenStrings(profile.responseShape),
    ..._flattenStrings(record.responseGuidance),
    ..._flattenStrings(record.responsePattern)
  ]);

  const constraints = _uniqStrings([
    ..._flattenStrings(profile.constraints),
    ..._flattenStrings(record.contraindications)
  ]);

  const followupStyle = _trim(profile.followupStyle || record.followupStyle || (_safeObj(supportFlags).suppressionPresent ? "soft_probe" : "reflective"));
  const deliveryTone = _trim(profile.deliveryTone || record.deliveryTone || _deriveToneGuide(primary, supportProfile, emotion, route, supportFlags));
  const semanticFrame = _trim(profile.semanticFrame || record.semanticFrame || _trim(routeObj.routeBias) || "supportive");
  const expressionStyle = _trim(profile.expressionStyle || record.expressionStyle || "plain_statement");
  const transitionReadiness = _trim(profile.transitionReadiness || record.transitionReadiness || ((_clamp01(_safeObj(emotion).intensity, 0)) >= 0.7 ? "low" : "medium"));

  return {
    semanticFrame,
    deliveryTone,
    expressionStyle,
    followupStyle,
    transitionReadiness,
    transitionTargets,
    responseShape,
    constraints
  };
}

function _buildEvidence(matches) {
  return _safeArray(matches).map((match, index) => {
    const record = _safeObj(match.record);
    return {
      id: `psych-${index + 1}`,
      source: "domain",
      dataset: "psychology_compiled",
      domain: "psychology",
      title: _trim(record.title || record.topic || record.subdomain || `psychology-${index + 1}`),
      summary: _uniqStrings([
        _trim(record.topic),
        _trim(record.subdomain),
        ..._safeArray(match.reasons).map((reason) => _trim(reason.value))
      ]).join(" | "),
      content: JSON.stringify(record),
      score: Math.max(0, Math.min(1, Number((match.score || 0) / 16).toFixed(4))),
      confidence: Math.max(0, Math.min(1, Number((match.score || 0) / 16).toFixed(4))),
      tags: _uniqStrings([
        "psychology",
        _trim(record.subdomain),
        _trim(record.topic),
        _trim(record.riskLevel),
        ..._safeArray(match.reasons).map((reason) => _trim(reason.type))
      ]),
      recency: 0,
      emotionalRelevance: 0.7,
      metadata: {
        reasons: match.reasons,
        supportMode: _trim(record.supportMode)
      }
    };
  });
}

function _confidence(primary, matches, route, supportFlags) {
  if (!primary) return 0;
  const base = Math.max(0, Math.min(1, Number((primary.score || 0) / 16)));
  const routeBoost = route && route.primarySubdomain ? 0.08 : 0;
  const densityBoost = _safeArray(matches).length > 1 ? 0.06 : 0;
  const suppressionAdjustment = _safeObj(supportFlags).suppressionPresent ? -0.03 : 0;
  return Math.max(0, Math.min(1, Number((base + routeBoost + densityBoost + suppressionAdjustment).toFixed(4))));
}

function _blendProfile(input) {
  const emotion = _safeObj(input.emotion);
  const blend = _safeObj(emotion.blendProfile);
  if (Object.keys(blend).length) return blend;
  const primaryEmotion = _trim(emotion.primaryEmotion);
  return {
    dominantAxis: primaryEmotion || "neutral",
    weights: primaryEmotion ? { [primaryEmotion]: 1 } : {},
    supportShape: primaryEmotion ? "single_axis" : "steady"
  };
}

function _stateDrift(input) {
  const emotion = _safeObj(input.emotion);
  const drift = _safeObj(emotion.stateDrift);
  if (Object.keys(drift).length) return drift;
  return {
    previousEmotion: null,
    currentEmotion: _trim(emotion.primaryEmotion || "") || null,
    previousIntensity: 0,
    currentIntensity: _clamp01(emotion.intensity, 0),
    delta: 0,
    trend: "steady",
    stable: true
  };
}

function _routePacket(routed) {
  const routeTo = _safeObj(routed.routeTo);
  return {
    ruleId: routed.ruleId || null,
    primarySubdomain: _trim(routeTo.primarySubdomain),
    secondarySubdomains: _safeArray(routeTo.secondarySubdomains).map(_trim).filter(Boolean),
    supportMode: _trim(routeTo.supportMode),
    routeBias: _trim(routeTo.routeBias)
  };
}

function _emptyResponse(reason) {
  return {
    ok: true,
    domain: "psychology",
    matched: false,
    patterns: [],
    risks: [],
    needs: [],
    recommendedApproach: "supportive",
    toneGuide: "balanced",
    confidence: 0,
    route: { ruleId: null, primarySubdomain: "", secondarySubdomains: [], supportMode: "", routeBias: "" },
    responsePlan: {
      semanticFrame: "supportive",
      deliveryTone: "balanced",
      expressionStyle: "plain_statement",
      followupStyle: "reflective",
      transitionReadiness: "medium",
      transitionTargets: [],
      responseShape: [],
      constraints: []
    },
    primary: null,
    matches: [],
    evidenceMatches: [],
    blendProfile: { dominantAxis: "neutral", weights: {}, supportShape: "steady" },
    stateDrift: { previousEmotion: null, currentEmotion: null, previousIntensity: 0, currentIntensity: 0, delta: 0, trend: "steady", stable: true },
    meta: { reason, source: FILE_NAME, version: VERSION }
  };
}

function retrievePsychology(input = {}) {
  const compiled = _loadCompiled();
  const text = _trim(input.text || input.query || input.userText || input.userQuery);
  const normalizedText = _normalizeText(text);
  const records = _safeArray(compiled.records);
  const emotion = _safeObj(input.emotion || input.lockedEmotion);
  const supportFlags = { ..._safeObj(emotion.supportFlags), ..._safeObj(input.supportFlags) };

  if (!text) return _emptyResponse("empty_text");

  const routed = _applyRouteRules({ text: normalizedText, supportFlags, riskLevel: input.riskLevel }, records);
  const scored = routed.records.map((record) => {
    const match = _scoreMatch(normalizedText, record);
    return {
      record,
      score: match.score,
      reasons: match.reasons,
      supportProfile: _enrichSupportMode(record)
    };
  });

  const top = _pickTopMatches(scored, Number(input.maxMatches) || 3);
  const primary = top[0] || null;
  const riskLevel = _deriveRiskLevel({ ...input, supportFlags, emotion }, primary);
  const route = _routePacket(routed);
  const primarySupportProfile = primary ? _safeObj(primary.supportProfile) : {};
  const patterns = _derivePatterns(primary, top, route);
  const risks = _deriveRisks(primary, riskLevel, supportFlags);
  const needs = _deriveNeeds(primary, supportFlags, emotion);
  const recommendedApproach = _deriveRecommendedApproach(route, primary, riskLevel, emotion, supportFlags);
  const toneGuide = _deriveToneGuide(primary, primarySupportProfile, emotion, route, supportFlags);
  const responsePlan = _responsePlan(primary, primarySupportProfile, route, supportFlags, emotion);
  const confidence = _confidence(primary, top, route, supportFlags);
  const evidenceMatches = _buildEvidence(top);
  const blendProfile = _blendProfile({ emotion });
  const stateDrift = _stateDrift({ emotion });

  return {
    ok: true,
    domain: "psychology",
    matched: !!primary,
    patterns,
    risks,
    needs,
    recommendedApproach,
    toneGuide,
    confidence,
    route,
    responsePlan,
    blendProfile,
    stateDrift,
    primary: primary ? {
      score: primary.score,
      reasons: primary.reasons,
      record: primary.record,
      supportProfile: primary.supportProfile
    } : null,
    matches: top.map((match) => ({
      score: match.score,
      reasons: match.reasons,
      record: match.record,
      supportProfile: match.supportProfile
    })),
    evidenceMatches,
    meta: {
      source: FILE_NAME,
      version: VERSION,
      normalizedText,
      recordCount: records.length,
      linkedMaps: [
        _cache.routeMapPath ? path.basename(_cache.routeMapPath, ".json") : null,
        _cache.supportMapPath ? path.basename(_cache.supportMapPath, ".json") : null
      ].filter(Boolean),
      compiledPath: _cache.compiledPath || null,
      derivedRiskLevel: riskLevel,
      compiledAvailable: !!_cache.compiledPath,
      routeMapAvailable: !!_cache.routeMapPath,
      supportMapAvailable: !!_cache.supportMapPath,
      retrievalPolicy: _safeObj(compiled.retrievalPolicy)
    }
  };
}

function retrievePsychologySafe(input = {}) {
  try {
    return retrievePsychology(input);
  } catch (error) {
    const degraded = _emptyResponse("retriever_error");
    degraded.meta.error = _trim(error && (error.message || error));
    degraded.meta.source = FILE_NAME;
    degraded.meta.version = VERSION;
    return degraded;
  }
}

module.exports = {
  VERSION,
  retrievePsychology: retrievePsychologySafe,
  retrieve: retrievePsychologySafe,
  handle: retrievePsychologySafe
};

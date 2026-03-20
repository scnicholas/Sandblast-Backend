"use strict";

const fs = require("fs");
const path = require("path");

const RUNTIME_ROOT = __dirname;
const MARION_ROOT = path.resolve(RUNTIME_ROOT, "..");
const COMPILED_PATH = path.join(MARION_ROOT, "compiled", "psychology_compiled.json");
const ROUTE_MAP_PATH = path.join(MARION_ROOT, "maps", "psychology_route_map.json");
const SUPPORT_MAP_PATH = path.join(MARION_ROOT, "maps", "psychology_support_map.json");

let _cache = {
  compiledMtime: 0,
  routeMapMtime: 0,
  supportMapMtime: 0,
  compiled: null,
  routeMap: null,
  supportMap: null
};

function _exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function _mtime(p) {
  try {
    return fs.statSync(p).mtimeMs || 0;
  } catch {
    return 0;
  }
}

function _readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function _safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function _safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function _str(v) {
  return v == null ? "" : String(v);
}

function _trim(v) {
  return _str(v).trim();
}

function _lower(v) {
  return _trim(v).toLowerCase();
}

function _tokenize(text) {
  return _lower(text)
    .replace(/[^a-z0-9\s'-]+/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function _normalizeText(text) {
  return _tokenize(text).join(" ");
}

function _loadCompiled() {
  if (!_exists(COMPILED_PATH)) {
    throw new Error(`Missing compiled psychology index: ${COMPILED_PATH}`);
  }
  const mtime = _mtime(COMPILED_PATH);
  if (!_cache.compiled || _cache.compiledMtime !== mtime) {
    _cache.compiled = _readJson(COMPILED_PATH);
    _cache.compiledMtime = mtime;
  }
  return _cache.compiled;
}

function _loadRouteMap() {
  if (!_exists(ROUTE_MAP_PATH)) {
    throw new Error(`Missing psychology route map: ${ROUTE_MAP_PATH}`);
  }
  const mtime = _mtime(ROUTE_MAP_PATH);
  if (!_cache.routeMap || _cache.routeMapMtime !== mtime) {
    _cache.routeMap = _readJson(ROUTE_MAP_PATH);
    _cache.routeMapMtime = mtime;
  }
  return _cache.routeMap;
}

function _loadSupportMap() {
  if (!_exists(SUPPORT_MAP_PATH)) {
    throw new Error(`Missing psychology support map: ${SUPPORT_MAP_PATH}`);
  }
  const mtime = _mtime(SUPPORT_MAP_PATH);
  if (!_cache.supportMap || _cache.supportMapMtime !== mtime) {
    _cache.supportMap = _readJson(SUPPORT_MAP_PATH);
    _cache.supportMapMtime = mtime;
  }
  return _cache.supportMap;
}

function _containsPhrase(haystack, phrase) {
  const h = _normalizeText(haystack);
  const p = _normalizeText(phrase);
  return !!p && h.includes(p);
}

function _scoreMatch(text, record) {
  let score = 0;
  const reasons = [];

  const signals = _safeArray(record.signals);
  const keywords = _safeArray(record.keywords);
  const triggers = _safeArray(record.triggers);
  const topic = _trim(record.topic);
  const title = _trim(record.title);

  for (const s of signals) {
    if (_containsPhrase(text, s)) {
      score += 6;
      reasons.push({ type: "signal", value: s, weight: 6 });
    }
  }

  for (const k of keywords) {
    if (_containsPhrase(text, k)) {
      score += 4;
      reasons.push({ type: "keyword", value: k, weight: 4 });
    }
  }

  for (const t of triggers) {
    if (_containsPhrase(text, t)) {
      score += 3;
      reasons.push({ type: "trigger", value: t, weight: 3 });
    }
  }

  if (topic && _containsPhrase(text, topic.replace(/_/g, " "))) {
    score += 2;
    reasons.push({ type: "topic", value: topic, weight: 2 });
  }

  if (title && _containsPhrase(text, title)) {
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
  for (const [k, v] of Object.entries(required)) {
    if (!!actual[k] !== !!v) return false;
  }
  return true;
}

function _matchesKeywordsAny(ruleKeywords, text) {
  const kws = _safeArray(ruleKeywords);
  if (!kws.length) return true;
  return kws.some((kw) => _containsPhrase(text, kw));
}

function _matchesRisk(ruleRisk, actualRisk) {
  if (!Array.isArray(ruleRisk) || !ruleRisk.length) return true;
  return ruleRisk.map(_lower).includes(_lower(actualRisk));
}

function _applyRouteRules(input, records) {
  const routeMap = _loadRouteMap();
  const text = _trim(input.text);
  const supportFlags = _safeObj(input.supportFlags);
  const riskLevel = _lower(input.riskLevel);

  for (const rule of _safeArray(routeMap.routingRules)) {
    const when = _safeObj(rule.when);
    const okFlags = _matchesSupportFlags(when.supportFlags, supportFlags);
    const okKeywords = _matchesKeywordsAny(when.keywordsAny, text);
    const okRisk = _matchesRisk(when.riskLevel, riskLevel);

    if (okFlags && okKeywords && okRisk) {
      const routeTo = _safeObj(rule.routeTo);
      const primary = _trim(routeTo.primarySubdomain);
      const secondary = _safeArray(routeTo.secondarySubdomains).map(_trim).filter(Boolean);

      const prioritized = records
        .slice()
        .sort((a, b) => {
          const aPrimary = a.subdomain === primary ? 1 : 0;
          const bPrimary = b.subdomain === primary ? 1 : 0;
          if (aPrimary !== bPrimary) return bPrimary - aPrimary;

          const aSecondary = secondary.includes(a.subdomain) ? 1 : 0;
          const bSecondary = secondary.includes(b.subdomain) ? 1 : 0;
          if (aSecondary !== bSecondary) return bSecondary - aSecondary;

          return 0;
        });

      return {
        ruleId: rule.id || null,
        routeTo,
        records: prioritized
      };
    }
  }

  return {
    ruleId: null,
    routeTo: _safeObj(routeMap.defaultRoute),
    records
  };
}

function _enrichSupportMode(record) {
  const supportMap = _loadSupportMap();
  const mode = _trim(record.supportMode);
  return _safeObj(supportMap.supportModes)[mode] || null;
}

function _pickTopMatches(scored, maxMatches) {
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const aRisk = _lower(a.record.riskLevel);
      const bRisk = _lower(b.record.riskLevel);
      const order = { critical: 4, high: 3, moderate: 2, low: 1 };
      return (order[bRisk] || 0) - (order[aRisk] || 0);
    })
    .slice(0, maxMatches);
}

function _deriveRiskLevel(input, primary) {
  const explicit = _trim(input.riskLevel);
  if (explicit) return _lower(explicit);

  const emotion = _safeObj(input.emotion);
  const supportFlags = _safeObj(input.supportFlags);

  if (supportFlags.needsContainment || supportFlags.highDistress) return "high";
  if ((emotion.intensity || 0) >= 0.7) return "high";
  if ((emotion.intensity || 0) >= 0.45) return "moderate";
  if (primary && primary.record && primary.record.riskLevel) return _lower(primary.record.riskLevel);
  return "low";
}

function _derivePatterns(primary, matches, route) {
  const values = [];

  if (route && route.primarySubdomain) values.push(route.primarySubdomain);

  for (const m of _safeArray(matches)) {
    const record = _safeObj(m.record);
    values.push(record.topic);
    values.push(record.subdomain);
    values.push(record.title);
  }

  return [...new Set(values.map(_trim).filter(Boolean))].slice(0, 6);
}

function _deriveRisks(primary, riskLevel, supportFlags) {
  const values = [];
  const record = _safeObj(primary && primary.record);

  values.push(record.riskLevel);
  values.push(..._safeArray(record.riskFlags));
  values.push(..._safeArray(record.risks));

  if (_safeObj(supportFlags).highDistress) values.push("high_distress");
  if (_safeObj(supportFlags).needsContainment) values.push("containment");
  if (_safeObj(supportFlags).needsStabilization) values.push("stabilization");

  if (riskLevel) values.push(riskLevel);

  return [...new Set(values.map(_trim).filter(Boolean))];
}

function _deriveNeeds(primary, supportFlags, emotion) {
  const record = _safeObj(primary && primary.record);
  const values = [];

  values.push(..._safeArray(record.needs));
  values.push(..._safeArray(record.responseNeeds));

  if (_safeObj(supportFlags).needsStabilization) values.push("stabilization");
  if (_safeObj(supportFlags).needsContainment) values.push("containment");
  if (_safeObj(supportFlags).needsConnection) values.push("connection");
  if (_safeObj(supportFlags).needsClarification) values.push("clarity");

  const primaryEmotion = _lower(_safeObj(emotion).primaryEmotion);
  if (primaryEmotion === "fear" || primaryEmotion === "panic") values.push("grounding");
  if (primaryEmotion === "sadness" || primaryEmotion === "grief") values.push("reassurance");
  if (primaryEmotion === "confusion" || primaryEmotion === "uncertainty") values.push("orientation");

  return [...new Set(values.map(_trim).filter(Boolean))];
}

function _deriveRecommendedApproach(route, primary, riskLevel, emotion) {
  const routeObj = _safeObj(route);
  const record = _safeObj(primary && primary.record);

  const explicit =
    _trim(routeObj.supportMode) ||
    _trim(record.supportMode) ||
    _trim(record.responseMode) ||
    _trim(record.approach);

  if (explicit) return explicit;

  if (riskLevel === "high" || riskLevel === "critical") return "supportive-directive";
  if ((_safeObj(emotion).intensity || 0) >= 0.6) return "supportive-containment";
  return "supportive";
}

function _deriveToneGuide(primary, supportProfile, emotion, route) {
  const record = _safeObj(primary && primary.record);
  const profile = _safeObj(supportProfile);
  const routeBias = _trim(_safeObj(route).routeBias);

  const explicit =
    _trim(profile.toneGuide) ||
    _trim(record.toneGuide) ||
    _trim(record.tone) ||
    _trim(record.voiceStyle);

  if (explicit) return explicit;
  if (routeBias) return routeBias;
  if ((_safeObj(emotion).intensity || 0) >= 0.6) return "warm and steady";
  return "balanced";
}

function _buildEvidence(matches) {
  return _safeArray(matches).map((m, idx) => {
    const record = _safeObj(m.record);
    return {
      id: `psych-${idx + 1}`,
      source: "domain",
      dataset: "psychology_compiled",
      domain: "psychology",
      title: _trim(record.title) || _trim(record.topic) || _trim(record.subdomain) || `psychology-${idx + 1}`,
      summary: [...new Set([
        _trim(record.topic),
        _trim(record.subdomain),
        ..._safeArray(m.reasons).map((r) => _trim(r.value))
      ].filter(Boolean))].join(" | "),
      content: JSON.stringify(record),
      score: Math.max(0, Math.min(1, Number((m.score || 0) / 16).toFixed(4))),
      confidence: Math.max(0, Math.min(1, Number((m.score || 0) / 16).toFixed(4))),
      tags: [...new Set([
        "psychology",
        _trim(record.subdomain),
        _trim(record.topic),
        _trim(record.riskLevel),
        ..._safeArray(m.reasons).map((r) => _trim(r.type))
      ].filter(Boolean))],
      recency: 0,
      emotionalRelevance: 0.7,
      metadata: {
        reasons: m.reasons,
        supportMode: _trim(record.supportMode)
      }
    };
  });
}

function _confidence(primary, matches, route) {
  if (!primary) return 0;
  const base = Math.max(0, Math.min(1, Number((primary.score || 0) / 16)));
  const routeBoost = route && route.primarySubdomain ? 0.08 : 0;
  const densityBoost = _safeArray(matches).length > 1 ? 0.06 : 0;
  return Math.max(0, Math.min(1, Number((base + routeBoost + densityBoost).toFixed(4))));
}

function retrievePsychology(input = {}) {
  const compiled = _loadCompiled();
  const text = _trim(input.text || input.query || input.userText);
  const normalizedText = _normalizeText(text);
  const records = _safeArray(compiled.records);
  const emotion = _safeObj(input.emotion);
  const supportFlags = _safeObj(input.supportFlags || emotion.supportFlags);

  if (!text) {
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
      matches: [],
      route: null,
      evidenceMatches: [],
      meta: {
        reason: "empty_text"
      }
    };
  }

  const routed = _applyRouteRules(
    {
      text,
      supportFlags,
      riskLevel: input.riskLevel
    },
    records
  );

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
  const riskLevel = _deriveRiskLevel(input, primary);

  const route = {
    ruleId: routed.ruleId,
    primarySubdomain: _trim(routed.routeTo.primarySubdomain),
    secondarySubdomains: _safeArray(routed.routeTo.secondarySubdomains),
    supportMode: _trim(routed.routeTo.supportMode),
    routeBias: _trim(routed.routeTo.routeBias)
  };

  const patterns = _derivePatterns(primary, top, route);
  const risks = _deriveRisks(primary, riskLevel, supportFlags);
  const needs = _deriveNeeds(primary, supportFlags, emotion);
  const recommendedApproach = _deriveRecommendedApproach(route, primary, riskLevel, emotion);
  const toneGuide = _deriveToneGuide(primary, primary ? primary.supportProfile : null, emotion, route);
  const confidence = _confidence(primary, top, route);
  const evidenceMatches = _buildEvidence(top);

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
    primary: primary
      ? {
          score: primary.score,
          reasons: primary.reasons,
          record: primary.record,
          supportProfile: primary.supportProfile
        }
      : null,
    matches: top.map((m) => ({
      score: m.score,
      reasons: m.reasons,
      record: m.record,
      supportProfile: m.supportProfile
    })),
    evidenceMatches,
    meta: {
      source: "psychology_compiled",
      normalizedText,
      recordCount: records.length,
      linkedMaps: ["psychology_route_map", "psychology_support_map"],
      derivedRiskLevel: riskLevel
    }
  };
}

function retrievePsychology_safe(input = {}) {
  try { return retrievePsychology(input); }
  catch (error) {
    const degraded = {"matched":false,"patterns":[],"risks":[],"needs":[],"recommendedApproach":"supportive","toneGuide":"balanced","confidence":0,"route":{},"primary":{},"matches":[],"evidenceMatches":[],"meta":{"degraded":true}};
    degraded.error = String(error && (error.message || error) || "retriever_error");
    return degraded;
  }
}

module.exports = {
  retrievePsychology: retrievePsychology_safe,
  retrieve: retrievePsychology_safe,
  handle: retrievePsychology_safe
};

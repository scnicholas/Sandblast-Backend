'use strict';

const VERSION = 'marion.crmLeadScorer/3.0';

function clean(value, max = 120) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function listEnv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map(value => clean(value, 100).toLowerCase())
    .filter(Boolean);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function includesAny(value, needles) {
  const haystack = clean(value, 240).toLowerCase();
  return needles.some(needle => haystack.includes(needle));
}

function score(lead = {}, options = {}) {
  let points = 0;
  const reasons = [];

  const engagement = lead.engagement || {};
  const interests = lead.interests || {};
  const location = lead.location || {};

  const targetIndustries = Array.isArray(options.targetIndustries)
    ? options.targetIndustries.map(value => clean(value, 100).toLowerCase()).filter(Boolean)
    : listEnv('CRM_PHASE3_TARGET_INDUSTRIES');

  const targetRegions = Array.isArray(options.targetRegions)
    ? options.targetRegions.map(value => clean(value, 100).toLowerCase()).filter(Boolean)
    : listEnv('CRM_PHASE3_TARGET_REGIONS');

  if ((engagement.formSubmissions || 0) > 0) {
    points += Math.min(25, 15 + (engagement.formSubmissions - 1) * 5);
    reasons.push('form_submission');
  }

  if ((engagement.replies || 0) > 0) {
    points += Math.min(25, 15 + (engagement.replies - 1) * 5);
    reasons.push('reply_engagement');
  }

  if ((engagement.appointments || 0) > 0) {
    points += 25;
    reasons.push('appointment_signal');
  }

  if ((engagement.calls || 0) > 0) {
    points += Math.min(15, 8 + (engagement.calls - 1) * 3);
    reasons.push('call_signal');
  }

  if ((engagement.pageViews || 0) >= 3) {
    points += Math.min(12, 4 + Math.floor(engagement.pageViews / 3) * 2);
    reasons.push('repeat_site_engagement');
  }

  if (interests.advertising) {
    points += 15;
    reasons.push('advertising_interest');
  }

  if (interests.radio || interests.tv) {
    points += 8;
    reasons.push('media_product_interest');
  }

  if (/linkedin/.test(lead.source || '')) {
    points += 6;
    reasons.push('linkedin_source');
  }

  if (targetIndustries.length && includesAny(lead.industry, targetIndustries)) {
    points += 8;
    reasons.push('industry_fit');
  }

  const regionText = [
    location.city,
    location.region,
    location.country
  ].filter(Boolean).join(' ').toLowerCase();

  if (targetRegions.length && targetRegions.some(value => regionText.includes(value))) {
    points += 8;
    reasons.push('region_fit');
  }

  const stage = clean(lead.stage, 80).toLowerCase();

  if (/(qualified|opportunity|proposal|appointment|booked)/.test(stage)) {
    points += 10;
    reasons.push('advanced_stage');
  }

  if (/(lost|disqualified|spam|invalid)/.test(stage)) {
    points -= 35;
    reasons.push('negative_stage');
  }

  const finalScore = Math.round(clamp(points));

  const band =
    finalScore >= 75 ? 'hot' :
    finalScore >= 50 ? 'warm' :
    finalScore >= 25 ? 'developing' :
    'cool';

  return {
    version: VERSION,
    score: finalScore,
    band,
    reasons: Array.from(new Set(reasons)).slice(0, 20),
    model: 'deterministic-sales-signal/3.0',
    targetFitConfigured: targetIndustries.length > 0 || targetRegions.length > 0
  };
}

module.exports = Object.freeze({
  VERSION,
  score
});

'use strict';

const crypto = require('crypto');

const VERSION = 'marion.crmLeadNormalizer/3.0';

function clean(value, max = 240) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function bool(value) {
  if (typeof value === 'boolean') return value;
  const s = clean(value, 16).toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(s);
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function opaque(value, prefix = 'ref') {
  const raw = clean(value, 256);
  if (!raw) return '';
  return `${prefix}-${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 20)}`;
}

function first(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function normalizeTags(value) {
  const source = Array.isArray(value)
    ? value
    : clean(value, 1000).split(/[;,|]/);

  return Array.from(
    new Set(
      source
        .map(item => clean(item, 80).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 30);
}

function normalizeEvents(value) {
  return arr(value)
    .slice(-30)
    .map(event => {
      const e = obj(event);
      return {
        type: clean(e.type || e.event || e.name, 80),
        timestamp: Number.isFinite(+e.timestamp) ? +e.timestamp : Date.now(),
        value: number(e.value, 0)
      };
    })
    .filter(event => event.type);
}

function normalize(input = {}) {
  const root = obj(input);
  const contact = obj(root.contact || root.lead || root.person);
  const opportunity = obj(root.opportunity || root.deal);
  const attribution = obj(root.attribution || root.source);
  const engagement = obj(root.engagement || root.activity);

  const rawLeadId = first(
    root.leadId,
    root.contactId,
    contact.id,
    contact.contactId,
    opportunity.contactId,
    opportunity.id
  );

  const rawAccountId = first(
    root.accountId,
    root.locationId,
    root.subAccountId,
    contact.locationId,
    opportunity.locationId
  );

  const company = clean(first(
    root.company,
    root.organization,
    contact.companyName,
    contact.company,
    opportunity.companyName
  ), 160);

  const industry = clean(first(
    root.industry,
    contact.industry,
    opportunity.industry
  ), 100).toLowerCase();

  const city = clean(first(root.city, contact.city), 100);
  const region = clean(first(
    root.region,
    root.state,
    root.province,
    contact.state,
    contact.province
  ), 100);
  const country = clean(first(root.country, contact.country), 100);

  const sourceName = clean(first(
    root.sourceName,
    root.source,
    attribution.name,
    attribution.source,
    contact.source,
    opportunity.source
  ), 100).toLowerCase();

  const stage = clean(first(
    root.stage,
    root.status,
    opportunity.stage,
    opportunity.status,
    contact.status
  ), 100).toLowerCase();

  const tags = normalizeTags(
    root.tags ||
    contact.tags ||
    opportunity.tags
  );

  const events = normalizeEvents(
    root.events ||
    engagement.events ||
    engagement.activity
  );

  const formSubmissions = Math.max(0, number(first(
    engagement.formSubmissions,
    root.formSubmissions,
    contact.formSubmissions
  ), 0));

  const pageViews = Math.max(0, number(first(
    engagement.pageViews,
    root.pageViews
  ), 0));

  const replies = Math.max(0, number(first(
    engagement.replies,
    root.replies
  ), 0));

  const calls = Math.max(0, number(first(
    engagement.calls,
    root.calls
  ), 0));

  const appointments = Math.max(0, number(first(
    engagement.appointments,
    root.appointments
  ), 0));

  const advertisingInterest = bool(first(
    root.advertisingInterest,
    opportunity.advertisingInterest,
    tags.includes('advertising'),
    tags.includes('advertiser')
  ));

  const radioInterest = bool(first(
    root.radioInterest,
    tags.includes('radio')
  ));

  const tvInterest = bool(first(
    root.tvInterest,
    tags.includes('tv'),
    tags.includes('television')
  ));

  const notes = clean(first(
    root.summary,
    root.notesSummary,
    opportunity.summary
  ), 800);

  return {
    contract: 'sandblast.marion.crm-lead/3.0',
    version: VERSION,

    leadRef: opaque(rawLeadId, 'lead'),
    accountRef: opaque(rawAccountId, 'acct'),

    company,
    industry,

    location: {
      city,
      region,
      country
    },

    source: sourceName || 'unknown',
    stage: stage || 'unknown',
    tags,

    engagement: {
      formSubmissions,
      pageViews,
      replies,
      calls,
      appointments,
      events
    },

    interests: {
      advertising: advertisingInterest,
      radio: radioInterest,
      tv: tvInterest
    },

    notes,

    consent: {
      marketingConsentKnown: bool(root.marketingConsentKnown),
      marketingConsent: bool(root.marketingConsent)
    },

    dataMinimization: {
      directEmailIncluded: false,
      directPhoneIncluded: false,
      rawContactIdIncluded: false
    },

    receivedAt: Number.isFinite(+root.timestamp)
      ? +root.timestamp
      : Date.now()
  };
}

function validate(lead = {}) {
  const errors = [];

  if (!lead || typeof lead !== 'object') {
    return { ok: false, errors: ['lead_required'] };
  }

  if (lead.contract !== 'sandblast.marion.crm-lead/3.0') {
    errors.push('contract_invalid');
  }

  if (!clean(lead.leadRef, 80)) {
    errors.push('lead_reference_required');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

module.exports = Object.freeze({
  VERSION,
  normalize,
  validate,
  normalizeTags,
  normalizeEvents
});

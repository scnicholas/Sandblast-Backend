'use strict';

const assert = require('assert');
const N = require('../../Data/marion/runtime/ecosystem/MarionCrmLeadNormalizer');
const S = require('../../Data/marion/runtime/ecosystem/MarionCrmLeadScorer');
const R = require('../../Data/marion/runtime/ecosystem/MarionCrmRecommendationPolicy');

const lead = N.normalize({
  contactId: 'lead-score-1',
  company: 'GTA Property Group',
  industry: 'real estate',
  city: 'Toronto',
  region: 'Ontario',
  country: 'Canada',
  source: 'LinkedIn',
  tags: ['advertising', 'tv'],
  engagement: {
    formSubmissions: 1,
    pageViews: 9,
    replies: 2,
    appointments: 1
  }
});

const scoring = S.score(lead, {
  targetIndustries: ['real estate'],
  targetRegions: ['toronto']
});

assert.ok(scoring.score >= 75);
assert.equal(scoring.band, 'hot');

const recommendation = R.recommend(lead, scoring);

assert.equal(recommendation.action, 'prepare_personalized_outreach');
assert.equal(recommendation.humanApprovalRequired, true);
assert.equal(recommendation.executeAutomatically, false);
assert.equal(R.isAllowedAction('send_email'), false);

console.log('PASS marion_ecosystem_phase3_crm_scoring_test');

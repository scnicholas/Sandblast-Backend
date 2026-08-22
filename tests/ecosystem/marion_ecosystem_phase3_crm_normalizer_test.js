'use strict';

const assert = require('assert');
const N = require('../../Data/marion/runtime/ecosystem/MarionCrmLeadNormalizer');

const lead = N.normalize({
  contact: {
    id: 'contact-123',
    companyName: 'Example Realty',
    industry: 'Real Estate',
    city: 'Toronto',
    state: 'Ontario',
    country: 'Canada',
    source: 'LinkedIn'
  },
  tags: ['advertising', 'radio'],
  engagement: {
    formSubmissions: 1,
    pageViews: 8,
    replies: 1
  }
});

assert.equal(N.validate(lead).ok, true);
assert.ok(/^lead-/.test(lead.leadRef));
assert.notEqual(lead.leadRef, 'contact-123');
assert.equal(lead.company, 'Example Realty');
assert.equal(lead.industry, 'real estate');
assert.equal(lead.interests.advertising, true);
assert.equal(lead.dataMinimization.directEmailIncluded, false);
assert.equal(lead.dataMinimization.directPhoneIncluded, false);

console.log('PASS marion_ecosystem_phase3_crm_normalizer_test');

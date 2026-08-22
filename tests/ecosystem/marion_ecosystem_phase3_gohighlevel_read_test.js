'use strict';

const assert = require('assert');
const GHL = require('../../Data/marion/runtime/ecosystem/MarionGoHighLevelReadAdapter');

(async () => {
  GHL.resetForTests();

  GHL.registerProvider({
    async getContact(id, options) {
      assert.equal(options.readOnly, true);
      return {
        id,
        companyName: 'Example Company',
        source: 'LinkedIn'
      };
    },

    async getOpportunity(id, options) {
      assert.equal(options.readOnly, true);
      return {
        id,
        stage: 'Qualified',
        tags: ['advertising']
      };
    }
  });

  const snapshot = await GHL.getLeadSnapshot({
    contactId: 'contact-1',
    opportunityId: 'opp-1'
  });

  assert.equal(snapshot.readOnly, true);
  assert.equal(snapshot.contact.id, 'contact-1');
  assert.equal(snapshot.opportunity.id, 'opp-1');

  console.log('PASS marion_ecosystem_phase3_gohighlevel_read_test');
})().catch(error => {
  console.error(error);
  process.exit(1);
});

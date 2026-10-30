'use strict';

const VERSION = 'marion.goHighLevelReadAdapter/3.0';

let provider = null;

function clean(value, max = 180) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function resolveMethod(client, names) {
  if (!client) return null;

  for (const name of names) {
    if (typeof client[name] === 'function') {
      return client[name].bind(client);
    }
  }

  return null;
}

function registerProvider(client) {
  provider = client && typeof client === 'object'
    ? client
    : null;

  return Boolean(provider);
}

function getProvider() {
  return provider;
}

async function getContact(contactId, options = {}) {
  const id = clean(contactId, 160);
  if (!id) throw new Error('contact_id_required');
  if (!provider) throw new Error('gohighlevel_read_provider_unavailable');

  const method = resolveMethod(provider, [
    'getContact',
    'readContact',
    'fetchContact'
  ]);

  if (!method) throw new Error('gohighlevel_get_contact_not_supported');

  return method(id, {
    ...options,
    readOnly: true
  });
}

async function getOpportunity(opportunityId, options = {}) {
  const id = clean(opportunityId, 160);
  if (!id) throw new Error('opportunity_id_required');
  if (!provider) throw new Error('gohighlevel_read_provider_unavailable');

  const method = resolveMethod(provider, [
    'getOpportunity',
    'readOpportunity',
    'fetchOpportunity'
  ]);

  if (!method) throw new Error('gohighlevel_get_opportunity_not_supported');

  return method(id, {
    ...options,
    readOnly: true
  });
}

async function getLeadSnapshot(input = {}, options = {}) {
  const contactId = clean(input.contactId, 160);
  const opportunityId = clean(input.opportunityId, 160);

  const result = {
    provider: 'gohighlevel',
    readOnly: true,
    contact: null,
    opportunity: null
  };

  if (contactId) {
    result.contact = await getContact(contactId, options);
  }

  if (opportunityId) {
    result.opportunity = await getOpportunity(opportunityId, options);
  }

  if (!contactId && !opportunityId) {
    throw new Error('contact_or_opportunity_id_required');
  }

  return result;
}

function getHealth() {
  return {
    ok: Boolean(provider),
    service: 'MarionGoHighLevelReadAdapter',
    version: VERSION,
    providerRegistered: Boolean(provider),
    readOnly: true
  };
}

function resetForTests() {
  provider = null;
}

module.exports = Object.freeze({
  VERSION,
  registerProvider,
  getProvider,
  getContact,
  getOpportunity,
  getLeadSnapshot,
  getHealth,
  resetForTests
});

'use strict';

const VERSION = 'marion.crmRecommendationPolicy/3.0';

const ALLOWED_ACTIONS = Object.freeze([
  'review_now',
  'prepare_personalized_outreach',
  'prepare_follow_up',
  'request_more_context',
  'nurture',
  'hold'
]);

function clean(value, max = 300) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function recommend(lead = {}, scoring = {}, marion = {}) {
  const score = Number(scoring.score || 0);
  const band = clean(scoring.band || 'cool', 32);
  const stage = clean(lead.stage || 'unknown', 80).toLowerCase();

  let action = 'nurture';
  let priority = 'low';
  let rationale = 'Lead has limited current engagement signals.';

  if (/(lost|disqualified|spam|invalid)/.test(stage)) {
    action = 'hold';
    priority = 'low';
    rationale = 'CRM stage indicates the lead should not be advanced automatically.';
  } else if (score >= 75) {
    action = 'prepare_personalized_outreach';
    priority = 'high';
    rationale = 'Multiple high-intent signals justify prompt human review and tailored outreach preparation.';
  } else if (score >= 50) {
    action = 'prepare_follow_up';
    priority = 'medium';
    rationale = 'Lead shows meaningful engagement and should receive a human-reviewed follow-up plan.';
  } else if (score >= 25) {
    action = 'request_more_context';
    priority = 'medium';
    rationale = 'Lead shows some useful signals, but more context is needed before active outreach.';
  }

  const marionAction = clean(
    marion.recommendedAction ||
    marion.action ||
    '',
    80
  );

  if (marionAction && ALLOWED_ACTIONS.includes(marionAction)) {
    action = marionAction;
  }

  return {
    version: VERSION,
    action,
    priority,
    rationale: clean(
      marion.rationale ||
      marion.reason ||
      rationale,
      500
    ),

    score,
    band,

    humanApprovalRequired: true,
    executeAutomatically: false,

    prohibitedAutomation: [
      'send_message',
      'send_email',
      'place_call',
      'delete_contact',
      'change_opportunity_stage',
      'change_owner',
      'create_charge',
      'modify_consequential_crm_field'
    ]
  };
}

function isAllowedAction(action) {
  return ALLOWED_ACTIONS.includes(clean(action, 80));
}

module.exports = Object.freeze({
  VERSION,
  ALLOWED_ACTIONS,
  recommend,
  isAllowedAction
});

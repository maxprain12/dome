'use strict';

/**
 * Provider capability matrix for social automations (plan 018).
 * Adapters exist for all three; live use still requires OAuth scopes on the token.
 */

/** @typedef {{ listComments: boolean, sendDm: boolean, commentsCountInMetrics: boolean, scopesNeeded: string[], notes: string }} SocialProviderCaps */

/** @type {Record<'linkedin'|'instagram'|'x', SocialProviderCaps>} */
const SOCIAL_PROVIDER_CAPABILITIES = {
  linkedin: {
    listComments: true,
    sendDm: true,
    commentsCountInMetrics: true,
    scopesNeeded: [
      'w_organization_social / r_organization_social (org comments)',
      'Messaging may require partner access — cold DM best-effort',
    ],
    notes:
      'listComments via socialActions comments (best on org posts). sendDm attempts LinkedIn messages API; may fail without partner product.',
  },
  instagram: {
    listComments: true,
    sendDm: true,
    commentsCountInMetrics: true,
    scopesNeeded: [
      'instagram_business_manage_comments',
      'instagram_business_manage_messages',
    ],
    notes:
      'listComments on media; sendDm via Instagram Messaging (cold DM to commenter IGSID). Requires Meta app products + reconnect.',
  },
  x: {
    listComments: true,
    sendDm: true,
    commentsCountInMetrics: true,
    scopesNeeded: ['tweet.read', 'dm.read', 'dm.write'],
    notes:
      'listComments via conversation search; sendDm via dm_conversations. Paid API tier often required.',
  },
};

/**
 * @returns {boolean}
 */
function anyProviderSupportsLiveCommentDm() {
  return Object.values(SOCIAL_PROVIDER_CAPABILITIES).some((c) => c.listComments && c.sendDm);
}

module.exports = {
  SOCIAL_PROVIDER_CAPABILITIES,
  anyProviderSupportsLiveCommentDm,
};

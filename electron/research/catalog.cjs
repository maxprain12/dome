
'use strict';

const CHANNELS = [
  ['web', ['read'], 'local', null],
  ['exa_search', ['search'], 'byok', null],
  ['rss', ['read'], 'local', null],
  ['github', ['search', 'read', 'profile'], 'public_api', null],
  ['v2ex', [], 'pending', 'access_review'],
  ['youtube', [], 'pending', 'authorized_media_required'],
  ['xiaoyuzhou', [], 'pending', 'authorized_media_required'],
  ['instagram', ['profile', 'read'], 'public_snapshot', 'partial_history'],
  ['linkedin', [], 'pending', 'access_review'],
  ['x', ['profile', 'read'], 'public_snapshot', 'partial_history'],
  ['reddit', [], 'pending', 'commercial_access_required'],
  ['facebook', [], 'pending', 'access_review'],
  ['bilibili', [], 'pending', 'access_review'],
  ['xiaohongshu', [], 'pending', 'access_review'],
  ['boss', [], 'pending', 'access_review'],
  ['xueqiu', [], 'pending', 'redistribution_review'],
];

function capabilities({ browser = null, enabledProviders = [], configuredProviders = [] } = {}) {
  return CHANNELS.map(([platform, operations, route, limitation]) => ({
    platform, operations, route,
    accessStatus: route === 'pending' ? 'pending_enablement' : 'enabled',
    technicalStatus: route === 'byok' ? (configuredProviders.includes('exa') ? 'configured' : 'unverified') : 'unverified',
    verifiedAt: null,
    limitations: limitation ? [limitation] : [],
    importSupported: true,
    ...(platform === 'web' ? { browser } : {}),
    ...(platform === 'exa_search' ? { enabledProviders, configuredProviders } : {}),
  }));
}

function channel(platform) {
  return capabilities().find((item) => item.platform === platform);
}

module.exports = { CHANNELS, capabilities, channel };

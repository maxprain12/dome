'use strict';

// Adapted platform/backend inventory from Agent-Reach (MIT); see bundled notices.
const UPSTREAM = {
  repository: 'https://github.com/Panniantong/Agent-Reach',
  commit: 'a19a171fa980a0785849596492e0af4db800c82f', license: 'MIT',
};
const GUIDES = {
  web: { group: 'web', upstream: ['Jina Reader'], backends: ['readability', 'browser'], setup: 'browser_extension', wanted: ['read'] },
  exa_search: { group: 'web', upstream: ['Exa MCP / mcporter'], backends: ['exa'], setup: 'research', wanted: ['search'] },
  rss: { group: 'web', upstream: ['feedparser'], backends: ['rss'], wanted: ['read'] },
  github: { group: 'web', upstream: ['GitHub CLI'], backends: ['github_api'], wanted: ['search', 'profile', 'read'] },
  v2ex: { group: 'community', upstream: ['V2EX API'], backends: ['import'], wanted: ['read', 'profile', 'thread'] },
  youtube: { group: 'media', upstream: ['yt-dlp'], backends: ['import'], setup: 'ai', wanted: ['search', 'transcript'] },
  xiaoyuzhou: { group: 'media', upstream: ['Groq / OpenAI Whisper'], backends: ['import'], setup: 'ai', wanted: ['transcript'] },
  instagram: { group: 'community', upstream: ['OpenCLI'], backends: ['public_snapshot', 'import'], setup: 'social', wanted: ['search', 'profile', 'posts'] },
  linkedin: { group: 'career', upstream: ['LinkedIn MCP', 'Jina Reader'], backends: ['import'], wanted: ['profile', 'search'] },
  x: { group: 'community', upstream: ['twitter-cli', 'OpenCLI', 'bird (legacy)'], backends: ['public_snapshot', 'import'], setup: 'social', wanted: ['search', 'profile', 'posts', 'thread'] },
  reddit: { group: 'community', upstream: ['OpenCLI', 'rdt-cli'], backends: ['import'], wanted: ['search', 'thread'] },
  facebook: { group: 'community', upstream: ['OpenCLI'], backends: ['import'], wanted: ['search', 'profile', 'posts'] },
  bilibili: { group: 'media', upstream: ['bili-cli', 'OpenCLI'], backends: ['import'], wanted: ['search', 'read', 'transcript'] },
  xiaohongshu: { group: 'community', upstream: ['OpenCLI', 'xiaohongshu-mcp', 'xhs-cli (legacy)'], backends: ['import'], wanted: ['search', 'read', 'thread'] },
  boss: { group: 'career', upstream: ['boss-agent-cli / dedicated Chrome'], backends: ['import'], wanted: ['search', 'read'] },
  xueqiu: { group: 'finance', upstream: ['OpenCLI'], backends: ['import'], wanted: ['search', 'read'] },
};
module.exports = { UPSTREAM, GUIDES };

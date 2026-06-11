/**
 * SSRF guard — blocks fetches to private/local/metadata hosts.
 */

const dns = require('dns').promises;
const net = require('net');
const { fetchWithTimeout } = require('./http-utils.cjs');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
]);

const MAX_REDIRECTS = 8;

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isPrivateIpv4(ip) {
  if (!net.isIPv4(ip)) return false;
  const n = ipv4ToInt(ip);
  if (ip.startsWith('127.') || ip.startsWith('0.')) return true;
  if (ip.startsWith('10.')) return true;
  if (n >= ipv4ToInt('172.16.0.0') && n <= ipv4ToInt('172.31.255.255')) return true;
  if (n >= ipv4ToInt('192.168.0.0') && n <= ipv4ToInt('192.168.255.255')) return true;
  if (n >= ipv4ToInt('169.254.0.0') && n <= ipv4ToInt('169.254.255.255')) return true;
  return false;
}

function isPrivateIpv6(ip) {
  if (!net.isIPv6(ip)) return false;
  const norm = ip.toLowerCase();
  if (norm === '::1' || norm === '::') return true;
  if (norm.startsWith('fe80:')) return true;
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true;
  return false;
}

function isBlockedIp(ip) {
  return isPrivateIpv4(ip) || isPrivateIpv6(ip);
}

function decodeIpv4Literal(hostname) {
  if (/^\d+$/.test(hostname)) {
    const num = Number(hostname);
    if (Number.isFinite(num) && num >= 0 && num <= 0xffffffff) {
      return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.');
    }
  }
  if (net.isIP(hostname)) return hostname;
  return null;
}

function assertHostnameAllowed(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) throw new Error('Blocked URL: empty hostname');
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    throw new Error('Blocked URL: local/private host');
  }
  const literal = decodeIpv4Literal(host);
  if (literal && isBlockedIp(literal)) {
    throw new Error('Blocked URL: private or local IP');
  }
}

async function assertPublicUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked URL protocol: ${parsed.protocol}`);
  }

  assertHostnameAllowed(parsed.hostname);

  const literal = decodeIpv4Literal(parsed.hostname);
  if (!literal) {
    const results = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
    for (const { address } of results) {
      if (isBlockedIp(address)) {
        throw new Error('Blocked URL: resolves to private or local IP');
      }
    }
  }

  return parsed.toString();
}

async function fetchPublicWithTimeout(url, options = {}, timeoutMs = 15000) {
  let current = await assertPublicUrl(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchWithTimeout(
      current,
      { ...options, redirect: 'manual' },
      timeoutMs,
    );

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return response;
      current = new URL(location, current).toString();
      await assertPublicUrl(current);
      continue;
    }

    return response;
  }

  throw new Error('Blocked URL: too many redirects');
}

module.exports = {
  assertPublicUrl,
  fetchPublicWithTimeout,
  isBlockedIp,
  isPrivateIpv4,
};

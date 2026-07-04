/**
 * Shared SonarQube + GitHub helpers for the quality loop.
 * Env: SONAR_HOST_URL, SONAR_TOKEN, GITHUB_TOKEN, SONAR_PROJECT_KEY (optional)
 */

const DEFAULT_SONAR_HOST = 'https://sonar.dowi.es';
const DEFAULT_PROJECT_KEY = 'maxprain12_dome_0330e2dd-e81b-4cb7-b746-e05da0c325af';
const DEFAULT_GITHUB_REPO = 'maxprain12/dome';

export function sonarHost() {
  return (process.env.SONAR_HOST_URL || DEFAULT_SONAR_HOST).replace(/\/$/, '');
}

export function sonarProjectKey() {
  return process.env.SONAR_PROJECT_KEY || DEFAULT_PROJECT_KEY;
}

export function githubRepo() {
  return process.env.GITHUB_REPOSITORY || DEFAULT_GITHUB_REPO;
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/** User token from env or Jenkins SonarQube plugin (`SONAR_AUTH_TOKEN`). */
export function sonarToken() {
  const token = process.env.SONAR_TOKEN || process.env.SONAR_AUTH_TOKEN;
  if (!token) {
    throw new Error(
      'Missing Sonar token: set SONAR_TOKEN or use Jenkins withSonarQubeEnv (SONAR_AUTH_TOKEN)',
    );
  }
  return token;
}

/** Sonar Web API: token as login, empty password (Basic). Bearer only on SonarQube 10.6+. */
export function sonarAuthHeader(token) {
  const scheme = (process.env.SONAR_AUTH_SCHEME || 'basic').toLowerCase();
  if (scheme === 'bearer') {
    return { Authorization: `Bearer ${token}` };
  }
  const encoded = Buffer.from(`${token}:`, 'utf8').toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

/**
 * @param {Record<string, string | number | boolean | undefined>} params
 */
export async function sonarFetch(path, params = {}, method = 'GET') {
  const token = sonarToken();
  const url = new URL(`${sonarHost()}${path}`);
  /** @type {RequestInit} */
  const init = {
    method,
    headers: sonarAuthHeader(token),
  };

  if (method === 'GET') {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  } else {
    init.headers = {
      ...init.headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    init.body = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sonar API ${path} failed (${res.status}): ${body.slice(0, 500)}`);
  }
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @param {Record<string, string>} [query]
 */
export async function githubFetch(method, path, query) {
  const token = requireEnv('GITHUB_TOKEN');
  const url = new URL(`https://api.github.com${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${method} ${path} failed (${res.status}): ${body.slice(0, 500)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = 'true';
    }
  }
  return out;
}

/** @param {string} severity Sonar severity label */
export function sonarSeverityLabel(severity) {
  const map = {
    BLOCKER: 'sonar-blocker',
    CRITICAL: 'sonar-critical',
    MAJOR: 'sonar-major',
    MINOR: 'sonar-minor',
    INFO: 'sonar-info',
  };
  return map[severity] || 'sonar-unknown';
}

const SONAR_LEGACY_SEVERITIES = ['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'];
const SONAR_IMPACT_SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'];

/**
 * Split CLI severity tokens into Sonar `/api/issues/search` params.
 * Legacy: INFO…BLOCKER → `severities`. Impact: HIGH/MEDIUM/LOW → `impactSeverities`.
 * @param {string} csv e.g. "BLOCKER,CRITICAL,MAJOR,HIGH"
 */
export function parseIssueSeverityFilter(csv) {
  /** @type {string[]} */
  const severities = [];
  /** @type {string[]} */
  const impactSeverities = [];
  /** @type {string[]} */
  const unknown = [];

  for (const raw of csv.split(',')) {
    const token = raw.trim().toUpperCase();
    if (!token) continue;
    if (SONAR_LEGACY_SEVERITIES.includes(token)) {
      severities.push(token);
    } else if (SONAR_IMPACT_SEVERITIES.includes(token)) {
      impactSeverities.push(token);
    } else {
      unknown.push(raw.trim());
    }
  }

  if (unknown.length) {
    throw new Error(
      `Invalid severity filter: ${unknown.join(', ')}. ` +
        `Use legacy [${SONAR_LEGACY_SEVERITIES.join(', ')}] ` +
        `and/or impact [${SONAR_IMPACT_SEVERITIES.join(', ')}].`,
    );
  }

  return { severities, impactSeverities };
}

/**
 * @param {Record<string, string | number | boolean | undefined>} params
 * @param {string} severityCsv
 */
export function withIssueSeverityFilter(params, severityCsv) {
  const { severities, impactSeverities } = parseIssueSeverityFilter(severityCsv);
  /** @type {Record<string, string | number | boolean | undefined>} */
  const out = { ...params };
  if (severities.length) out.severities = severities.join(',');
  if (impactSeverities.length) out.impactSeverities = impactSeverities.join(',');
  return out;
}

/** @param {string} impact Software quality impact (SECURITY, RELIABILITY, MAINTAINABILITY) */
export function sonarImpactLabel(impact) {
  if (!impact) return 'sonar-maintainability';
  return `sonar-${impact.toLowerCase()}`;
}

export const SONAR_KEY_RE = /sonarKey:\s*([A-Za-z0-9_-]+)/;

/** @param {string} body */
export function extractSonarKey(body) {
  const m = body.match(SONAR_KEY_RE);
  return m ? m[1] : null;
}

/** @param {{ key: string, rule: string, severity: string, message: string, component: string, line?: number, impacts?: Array<{ softwareQuality: string }> }} issue */
export function formatGithubIssueBody(issue) {
  const file = issue.component?.includes(':')
    ? issue.component.split(':').slice(1).join(':')
    : issue.component;
  const line = issue.line ? `:${issue.line}` : '';
  const impact = issue.impacts?.[0]?.softwareQuality || 'MAINTAINABILITY';
  return `## SonarQube
- **Key**: ${issue.key}
- **Rule**: ${issue.rule}
- **Severity**: ${issue.severity}
- **Impact**: ${impact}
- **File**: ${file}${line}
- **Message**: ${issue.message}

## Acceptance
- [ ] Fix passes typecheck + lint + test:coverage
- [ ] Sonar issue no longer OPEN on next analysis
`;
}

/** @param {{ rule: string, message: string, component: string, line?: number }} issue */
export function formatGithubIssueTitle(issue) {
  const file = issue.component?.includes(':')
    ? issue.component.split(':').slice(1).join(':')
    : issue.component;
  const base = file.split('/').pop() || file;
  const shortMsg = issue.message.length > 60 ? `${issue.message.slice(0, 57)}…` : issue.message;
  return `[Sonar] ${shortMsg} — ${base}${issue.line ? `:${issue.line}` : ''}`;
}

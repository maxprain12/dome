#!/usr/bin/env node
/**
 * posthog-flag.mjs
 *
 * Enables a PostHog feature flag for the internal team after a PR merge.
 * Called by the post-merge GitHub Actions workflow.
 *
 * Required env vars:
 *   POSTHOG_PROJECT_API_KEY  - Personal API key (Settings → Personal API keys)
 *   POSTHOG_PROJECT_ID       - Project ID (Settings → Project → ID)
 *   FLAG_NAME                - Flag key to enable (e.g. dome-cloud-ai)
 *
 * Optional:
 *   POSTHOG_HOST             - Default: https://us.i.posthog.com
 *   PR_NUMBER                - For logging
 *   PR_TITLE                 - For logging
 */

const API_KEY = process.env.POSTHOG_PROJECT_API_KEY;
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const HOST = (process.env.POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
const FLAG_NAME = process.env.FLAG_NAME;
const PR_NUMBER = process.env.PR_NUMBER || '?';
const PR_TITLE = process.env.PR_TITLE || '?';

if (!API_KEY || !PROJECT_ID || !FLAG_NAME) {
  console.error('❌ Missing required env vars: POSTHOG_PROJECT_API_KEY, POSTHOG_PROJECT_ID, FLAG_NAME');
  process.exit(1);
}

const BASE = `${HOST}/api/projects/${PROJECT_ID}`;

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PostHog API ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  console.log(`🚀 PR #${PR_NUMBER} merged: "${PR_TITLE}"`);
  console.log(`🔍 Looking up flag: ${FLAG_NAME}`);

  // 1. Find the flag by key
  const list = await request('GET', `/feature_flags/?key=${encodeURIComponent(FLAG_NAME)}`);
  const existing = list.results?.find((f) => f.key === FLAG_NAME);

  if (!existing) {
    console.log(`⚠️  Flag "${FLAG_NAME}" not found in PostHog. Creating it...`);

    // Create the flag (active, 0% rollout — team will enable manually from here)
    const created = await request('POST', '/feature_flags/', {
      key: FLAG_NAME,
      name: FLAG_NAME,
      active: true,
      rollout_percentage: null,
      filters: {
        groups: [
          {
            // Enable for internal team property: dome_team = true
            // Set this property on your internal users via PostHog identify()
            properties: [{ key: 'dome_team', type: 'person', value: 'true', operator: 'exact' }],
            rollout_percentage: 100,
          },
        ],
      },
    });

    console.log(`✅ Flag "${FLAG_NAME}" created and enabled for users where dome_team=true`);
    console.log(`   PostHog flag ID: ${created.id}`);
  } else {
    console.log(`✅ Flag "${FLAG_NAME}" found (ID: ${existing.id})`);

    // If flag exists but is inactive, activate it
    if (!existing.active) {
      await request('PATCH', `/feature_flags/${existing.id}/`, { active: true });
      console.log(`✅ Flag activated.`);
    }

    // Check if team group already exists in filters
    const hasTeamGroup = existing.filters?.groups?.some((g) =>
      g.properties?.some((p) => p.key === 'dome_team')
    );

    if (!hasTeamGroup) {
      // Add internal team group to existing filters
      const groups = existing.filters?.groups || [];
      groups.unshift({
        properties: [{ key: 'dome_team', type: 'person', value: 'true', operator: 'exact' }],
        rollout_percentage: 100,
      });

      await request('PATCH', `/feature_flags/${existing.id}/`, {
        filters: { ...existing.filters, groups },
      });

      console.log(`✅ Internal team group added to flag "${FLAG_NAME}".`);
    } else {
      console.log(`ℹ️  Team group already present in flag "${FLAG_NAME}". No changes needed.`);
    }
  }

  console.log('');
  console.log('📋 Next steps for gradual rollout:');
  console.log('  1. Test internally (users where dome_team=true see the new feature)');
  console.log('  2. PostHog Dashboard → Feature Flags → Add percentage rollout groups');
  console.log('  3. Rollout: 10% → 25% → 50% → 100%');
  console.log('  4. Kill switch: toggle flag OFF instantly if issues arise');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseDotEnv,
  pickSupabaseFromRecord,
} from '../auth/supabase-credentials.cjs';

describe('supabase-credentials', () => {
  it('parseDotEnv ignores comments and quotes', () => {
    const parsed = parseDotEnv(`
# comment
SUPABASE_URL="https://example.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY='eyJ.test'
`);
    assert.equal(parsed.SUPABASE_URL, 'https://example.supabase.co');
    assert.equal(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'eyJ.test');
  });

  it('pickSupabaseFromRecord prefers SUPABASE_* then NEXT_PUBLIC_*', () => {
    assert.deepEqual(
      pickSupabaseFromRecord({
        SUPABASE_URL: 'https://a.supabase.co',
        SUPABASE_ANON_KEY: 'anon-a',
        NEXT_PUBLIC_SUPABASE_URL: 'https://b.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-b',
      }),
      { url: 'https://a.supabase.co', anonKey: 'anon-a' },
    );

    assert.deepEqual(
      pickSupabaseFromRecord({
        NEXT_PUBLIC_SUPABASE_URL: 'https://b.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-b',
      }),
      { url: 'https://b.supabase.co', anonKey: 'anon-b' },
    );

    assert.equal(pickSupabaseFromRecord({ SUPABASE_URL: 'https://a.supabase.co' }), null);
  });
});

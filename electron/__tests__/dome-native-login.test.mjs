import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDomeUserId } from '../auth/dome-session-identity.cjs';

function mintUnsigned(sub) {
  const payload = Buffer.from(JSON.stringify({ sub, aud: 'dome-desktop' })).toString('base64url');
  return `${payload}.sig`;
}

describe('resolveDomeUserId', () => {
  it('prefers user_id from the provider token JSON', () => {
    assert.equal(
      resolveDomeUserId({
        access_token: mintUnsigned('jwt-sub'),
        user_id: '11111111-1111-4111-8111-111111111111',
      }),
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('falls back to JWT sub when user_id is missing', () => {
    assert.equal(resolveDomeUserId({ access_token: mintUnsigned('jwt-sub') }), 'jwt-sub');
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  commentMatchesHashtag,
  normalizeHashtag,
  renderReplyTemplate,
} from '../social/social-comment-match.cjs';

describe('social-comment-match', () => {
  it('normalizes hashtags', () => {
    assert.equal(normalizeHashtag('#Curso'), 'curso');
    assert.equal(normalizeHashtag('  ##Curso  '), 'curso');
  });

  it('matches #Curso case-insensitively', () => {
    assert.equal(commentMatchesHashtag('Me interesa #Curso', 'Curso'), true);
    assert.equal(commentMatchesHashtag('me interesa #curso ya', '#CURSO'), true);
    assert.equal(commentMatchesHashtag('curso sin hash', 'Curso'), true);
  });

  it('does not match prefix of another token', () => {
    assert.equal(commentMatchesHashtag('hola #Cursores', 'Curso'), false);
  });

  it('renders reply templates', () => {
    const out = renderReplyTemplate('Hola {{author}} — enlace {{link}} (#{{hashtag}})', {
      author: 'Ada',
      link: 'https://dome.app/c/1',
      hashtag: 'Curso',
    });
    assert.equal(out, 'Hola Ada — enlace https://dome.app/c/1 (#Curso)');
  });
});

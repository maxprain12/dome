import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { WebSearchResults, searchResultDomain } from './WebSearchResults';
it('ignores malformed and non-web source URLs without losing valid results', () => {
  expect(searchResultDomain('https://%')).toBeNull();
  expect(searchResultDomain('javascript:alert(1)')).toBeNull();
  render(<WebSearchResults result={{ results: [{ title: 'Malformed', url: 'https://%' }, { title: 'Source', url: 'https://example.org/article' }] }} />);
  expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://example.org/article');
  expect(screen.queryByText('Malformed')).not.toBeInTheDocument();
  expect(screen.getByText('example.org')).toBeInTheDocument();
});

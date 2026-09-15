import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import type { SocialPost } from '@/components/social/socialTypes';
import { SocialEditorialQueue, SocialRecentPublications } from './SocialEditorialPanels';

beforeEach(async () => { await i18n.changeLanguage('en'); });
const post = (id: string, status: SocialPost['status'], scheduledAt = 0): SocialPost => ({ id, status, body: id, scheduledAt, provider: 'linkedin', accountId: null, media: [], linkUrl: null, topics: [], campaign: null, publishedAt: null, externalPostId: null, externalUrl: null, error: null, createdBy: 'user', groupId: null, createdAt: Date.now(), updatedAt: Date.now() });

it('sorts scheduled work chronologically and opens the selected draft or composer', async () => {
  const onOpenPost = vi.fn();
  const onCompose = vi.fn();
  const posts = [post('Later', 'scheduled', Date.now() + 20000), post('Sooner', 'scheduled', Date.now() + 10000), post('My draft', 'draft')];
  render(<SocialEditorialQueue posts={posts} onOpenPost={onOpenPost} onCompose={onCompose} />);
  expect(screen.getAllByRole('button').filter((button) => /Sooner|Later/.test(button.textContent ?? '')).map((button) => button.textContent?.split('LinkedIn')[0])).toEqual(['Sooner', 'Later']);
  await userEvent.click(screen.getByRole('button', { name: /Drafts/ }));
  await userEvent.click(screen.getByRole('button', { name: /My draft/ }));
  expect(onOpenPost).toHaveBeenCalledWith(posts[2]);
  await userEvent.click(screen.getByRole('button', { name: 'Create post' }));
  expect(onCompose).toHaveBeenCalledOnce();
});

it('distinguishes unavailable metrics from measured zero', () => {
  render(<SocialRecentPublications posts={[post('Published story', 'published')]} onOpenPost={() => {}} onOpenContent={() => {}} />);
  expect(screen.getAllByText('—')).toHaveLength(2);
});

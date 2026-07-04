import type { ToolDefinition } from '../../../types.js';

export const socialPostDraftDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'social_post_draft',
    description:
      'Create a social media post (draft or scheduled) for LinkedIn, Instagram or X. ' +
      'If scheduled_at is given the post is auto-published at that time; otherwise it is saved as a draft the user can review in the Social tab. ' +
      'Instagram requires at least one media item with a PUBLIC https image/video URL. X is limited to 280 characters. Source: Social hub.',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['linkedin', 'instagram', 'x'], description: 'Target network' },
        body: { type: 'string', description: 'Post text/caption. Limits: X 280, Instagram 2200, LinkedIn 3000 chars.' },
        media: {
          type: 'array',
          description:
            'Media items. Each item has ONE source: resource_id (Dome vault image/video resource — preferred), path (absolute local file), or url (public https). ' +
            'LinkedIn/X upload files natively (vault resources and local paths). Instagram accepts ONLY public https urls (its API downloads the media; no file upload).',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['image', 'video', 'reel'] },
              resource_id: { type: 'string', description: 'Dome image/video resource id (from resource_search/resource_list)' },
              path: { type: 'string', description: 'Absolute local file path' },
              url: { type: 'string', description: 'Public https URL' },
            },
          },
        },
        link_url: { type: 'string', description: 'Optional link to share (LinkedIn article / appended to X text).' },
        topics: { type: 'array', items: { type: 'string' }, description: 'Topic tags for performance analysis (e.g. ["ai", "productivity"]).' },
        campaign: { type: 'string', description: 'Optional campaign name to group posts.' },
        scheduled_at: { type: 'string', description: 'ISO datetime to auto-publish (e.g. 2026-07-04T09:00:00). Omit to save as draft.' },
      },
      required: ['provider', 'body'],
    },
  },
};

export const DOME_LOAD_DOC_ID = 'social_tool' as const;

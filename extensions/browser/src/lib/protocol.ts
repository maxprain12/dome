export const DEFAULT_PORT = 37215;
export const BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
export const TOKEN_PREFIX = 'dxt_';

export type IdentitySource =
  | 'social_linkedin'
  | 'social_instagram'
  | 'social_x'
  | 'github'
  | 'website'
  | 'email'
  | 'manual';

export type ContactDraft = {
  displayName: string;
  source: IdentitySource;
  externalId: string;
  displayLabel?: string;
  avatarUrl?: string;
  primaryEmail?: string;
  notes?: string;
  profile?: Record<string, unknown>;
  pageUrl: string;
};

export type NoteSummary = {
  id: string;
  title: string;
  updatedAt: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
};

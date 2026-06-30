// Thin typed wrapper over window.electron.github (IPC). Renderer-only.

const gh = () => window.electron.github;

/** URLs that need OAuth to load (GitHub issue attachments). */
export function isGithubHostedImageUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'github.com' || h.endsWith('githubusercontent.com');
  } catch {
    return false;
  }
}

/** Convert HTML <img> tags in GitHub bodies to markdown image syntax. */
export function normalizeGithubHtmlImages(markdown: string): string {
  if (!markdown) return markdown;
  return markdown.replace(
    /<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi,
    (_, url: string) => `![imagen](${url})`,
  );
}

export interface GitHubIssuesListOptions {
  state?: 'open' | 'closed';
  limit?: number;
  offset?: number;
  projectId?: string;
}

export interface GitHubIssuesListResult {
  success: boolean;
  issues?: GitHubIssueRow[];
  total?: number;
  limit?: number;
  offset?: number;
  truncated?: boolean;
  error?: string;
}

export interface GitHubSetSelectedPayload {
  projectId: string;
  selected: boolean;
  repoId?: string;
  remote?: GitHubCatalogRepoRow;
}

export interface GitHubRefreshResult {
  success: boolean;
  catalog?: GitHubCatalogRepoRow[];
  tracked?: GitHubRepoRow[];
  assignments?: Record<string, string[]>;
  error?: string;
}

export const githubClient = {
  auth: {
    start: () => gh().auth.start(),
    poll: (payload: { deviceCode: string; interval?: number; expiresIn?: number }) => gh().auth.poll(payload),
    status: () => gh().auth.status(),
    disconnect: () => gh().auth.disconnect(),
  },
  repos: {
    list: (projectId?: string) => gh().repos.list(projectId ? { projectId } : undefined),
    refresh: (projectId?: string) => gh().repos.refresh(projectId ? { projectId } : undefined) as Promise<GitHubRefreshResult>,
    setSelected: (payload: GitHubSetSelectedPayload) => gh().repos.setSelected(payload),
  },
  milestones: {
    list: (repoId: string, projectId?: string) => gh().milestones.list(repoId, projectId ? { projectId } : undefined),
    get: (id: string) => gh().milestones.get(id),
    create: (repoId: string, data: { title: string; description?: string; dueOn?: number | null; state?: string; projectId?: string }) =>
      gh().milestones.create(repoId, data),
    update: (id: string, patch: Record<string, unknown>) => gh().milestones.update(id, patch),
  },
  issues: {
    list: (repoId: string, opts?: GitHubIssuesListOptions) => gh().issues.list(repoId, opts) as Promise<GitHubIssuesListResult>,
    get: (id: string) => gh().issues.get(id),
    create: (repoId: string, data: { title: string; body?: string; milestoneNumber?: number; labels?: string[]; assignees?: string[]; projectId?: string }) =>
      gh().issues.create(repoId, data),
    update: (id: string, patch: Record<string, unknown>) => gh().issues.update(id, patch),
    move: (id: string, target: { state?: 'open' | 'closed'; milestoneNumber?: number | null }) => gh().issues.move(id, target),
    listComments: (issueId: string) => gh().issues.listComments(issueId),
    createComment: (issueId: string, body: string) => gh().issues.createComment(issueId, body),
    listTimeline: (issueId: string) => gh().issues.listTimeline(issueId),
    listMentionables: (issueId: string) => gh().issues.listMentionables(issueId),
  },
  branches: { list: (repoId: string, projectId?: string) => gh().branches.list(repoId, projectId ? { projectId } : undefined) },
  releases: { list: (repoId: string, projectId?: string) => gh().releases.list(repoId, projectId ? { projectId } : undefined) },
  resolveImage: (url: string) => gh().resolveImage(url),
  syncNow: (projectId?: string) =>
    gh().syncNow(projectId ? { projectId } : undefined),
  onSyncStatus: (cb: (d: { status: string; lastSync?: number; error?: string }) => void) => gh().onSyncStatus(cb),
  onDataUpdated: (cb: (d: { local?: boolean }) => void) => gh().onDataUpdated(cb),
};

/**
 * @deprecated Prefer MarkdownRenderer githubImageProxy + GithubProxyImage.
 * Kept for callers that pre-process markdown strings.
 */
export async function resolveGithubImages(markdown: string): Promise<string> {
  return normalizeGithubHtmlImages(markdown);
}

export function parseLabels(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

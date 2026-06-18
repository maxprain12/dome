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

export const githubClient = {
  auth: {
    start: () => gh().auth.start(),
    poll: (payload: { deviceCode: string; interval?: number; expiresIn?: number }) => gh().auth.poll(payload),
    status: () => gh().auth.status(),
    disconnect: () => gh().auth.disconnect(),
  },
  repos: {
    list: () => gh().repos.list(),
    refresh: () => gh().repos.refresh(),
    setSelected: (repoId: string, selected: boolean) => gh().repos.setSelected(repoId, selected),
  },
  milestones: {
    list: (repoId: string) => gh().milestones.list(repoId),
    create: (repoId: string, data: { title: string; description?: string; dueOn?: number | null; state?: string }) =>
      gh().milestones.create(repoId, data),
    update: (id: string, patch: Record<string, unknown>) => gh().milestones.update(id, patch),
  },
  issues: {
    list: (repoId: string) => gh().issues.list(repoId),
    get: (id: string) => gh().issues.get(id),
    create: (repoId: string, data: { title: string; body?: string; milestoneNumber?: number; labels?: string[]; assignees?: string[] }) =>
      gh().issues.create(repoId, data),
    update: (id: string, patch: Record<string, unknown>) => gh().issues.update(id, patch),
    move: (id: string, target: { state?: 'open' | 'closed'; milestoneNumber?: number | null }) => gh().issues.move(id, target),
    listComments: (issueId: string) => gh().issues.listComments(issueId),
    createComment: (issueId: string, body: string) => gh().issues.createComment(issueId, body),
    listTimeline: (issueId: string) => gh().issues.listTimeline(issueId),
    listMentionables: (issueId: string) => gh().issues.listMentionables(issueId),
  },
  branches: { list: (repoId: string) => gh().branches.list(repoId) },
  releases: { list: (repoId: string) => gh().releases.list(repoId) },
  resolveImage: (url: string) => gh().resolveImage(url),
  syncNow: () => gh().syncNow(),
  onSyncStatus: (cb: (d: { status: string; lastSync?: number; error?: string }) => void) => gh().onSyncStatus(cb),
  onDataUpdated: (cb: (d: Record<string, unknown>) => void) => gh().onDataUpdated(cb),
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

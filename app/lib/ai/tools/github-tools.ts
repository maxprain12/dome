/**
 * GitHub Seguimiento tools — milestones, issues, repos synced in Dome.
 * Execution in Many runs via main-process dispatcher (toolDefinitions → createToolRegistry).
 * Local execute uses githubClient IPC when invoked from renderer-only paths.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readNumberParam, readBooleanParam } from './common';
import { githubClient } from '@/lib/github/client';
import { isElectronAI } from '@/lib/utils/formatting';

const RepoIdSchema = Type.String({
  description: 'Dome repo id (e.g. ghr-12345) from github_list_repos.',
});

function requireElectron() {
  if (!isElectronAI()) {
    return jsonResult({ success: false, error: 'GitHub tools require the Dome desktop app.' });
  }
  return null;
}

export function createGithubListReposTool(): AnyAgentTool {
  return {
    label: 'List GitHub repos',
    name: 'github_list_repos',
    description:
      'List GitHub repositories synced in Dome Seguimiento (id, full_name, selected). ' +
      'Call this before github_list_milestones when you need a repo_id. Source: GitHub.',
    parameters: Type.Object({
      selected_only: Type.Optional(
        Type.Boolean({ description: 'Only repos selected for sync (default true).' }),
      ),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const selectedOnly = readBooleanParam(args as Record<string, unknown>, 'selected_only') ?? true;
      const res = await githubClient.repos.list();
      if (!res.success) return jsonResult({ success: false, error: res.error });
      const repos = (res.repos ?? []).filter((r) => !selectedOnly || r.selected === 1);
      return jsonResult({ success: true, source: 'github', repos });
    },
  };
}

export function createGithubListMilestonesTool(): AnyAgentTool {
  return {
    label: 'List GitHub milestones',
    name: 'github_list_milestones',
    description:
      'List milestones for one synced repo (title, due_on delivery date, state, progress). ' +
      'Use github_list_repos first for repo_id, or github_upcoming_milestones for all repos. Source: GitHub.',
    parameters: Type.Object({
      repo_id: RepoIdSchema,
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const repoId = readStringParam(args as Record<string, unknown>, 'repo_id', { required: true });
      const res = await githubClient.milestones.list(repoId!);
      if (!res.success) return jsonResult({ success: false, error: res.error });
      return jsonResult({ success: true, source: 'github', milestones: res.milestones ?? [] });
    },
  };
}

export function createGithubUpcomingMilestonesTool(): AnyAgentTool {
  return {
    label: 'GitHub upcoming milestones',
    name: 'github_upcoming_milestones',
    description:
      'List milestones across ALL synced GitHub repos, sorted by delivery date (due_on). ' +
      'Use when the user asks about fechas de entrega, próximos hitos, últimas entregas, or GitHub roadmap. Source: GitHub.',
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: 'Max milestones to return (default 30).' })),
      state: Type.Optional(
        Type.Union([Type.Literal('open'), Type.Literal('closed'), Type.Literal('all')], {
          description: 'Filter by milestone state (default all).',
        }),
      ),
      include_past_due: Type.Optional(
        Type.Boolean({
          description: 'Include milestones whose due_on is in the past (default true).',
        }),
      ),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const limit = readNumberParam(params, 'limit') ?? 30;
      const state = readStringParam(params, 'state') ?? 'all';
      const includePastDue = readBooleanParam(params, 'include_past_due') ?? true;

      const reposRes = await githubClient.repos.list();
      if (!reposRes.success) return jsonResult({ success: false, error: reposRes.error });
      const repos = (reposRes.repos ?? []).filter((r) => r.selected === 1);

      type Row = {
        repo: string;
        repo_id: string;
        id: string;
        number: number;
        title: string;
        state: string;
        due_on: number | null;
        closed_at?: number | null;
        open_issues: number;
        closed_issues: number;
        url: string | null;
      };

      const rows: Row[] = [];
      const now = Date.now();

      for (const repo of repos) {
        const msRes = await githubClient.milestones.list(repo.id);
        if (!msRes.success || !msRes.milestones) continue;
        for (const m of msRes.milestones) {
          if (state !== 'all' && m.state !== state) continue;
          if (!includePastDue && m.due_on != null && m.due_on < now) continue;
          rows.push({
            repo: repo.full_name,
            repo_id: repo.id,
            id: m.id,
            number: m.number,
            title: m.title,
            state: m.state,
            due_on: m.due_on,
            closed_at: m.closed_at ?? null,
            open_issues: m.open_issues,
            closed_issues: m.closed_issues,
            url: m.html_url,
          });
        }
      }

      rows.sort((a, b) => {
        if (a.due_on == null && b.due_on == null) return a.title.localeCompare(b.title);
        if (a.due_on == null) return 1;
        if (b.due_on == null) return -1;
        return a.due_on - b.due_on;
      });

      return jsonResult({
        success: true,
        source: 'github',
        count: rows.length,
        milestones: rows.slice(0, Math.max(1, Math.min(limit, 100))),
      });
    },
  };
}

export function createGithubListIssuesTool(): AnyAgentTool {
  return {
    label: 'List GitHub issues',
    name: 'github_list_issues',
    description: 'List issues for a synced GitHub repo. Source: GitHub.',
    parameters: Type.Object({
      repo_id: RepoIdSchema,
      state: Type.Optional(
        Type.Union([Type.Literal('open'), Type.Literal('closed'), Type.Literal('all')], {
          description: 'Filter by state (default all).',
        }),
      ),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const repoId = readStringParam(params, 'repo_id', { required: true });
      const state = readStringParam(params, 'state') ?? 'all';
      const filterState = state === 'open' || state === 'closed' ? state : undefined;
      const res = await githubClient.issues.list(repoId!, { state: filterState });
      if (!res.success) return jsonResult({ success: false, error: res.error });
      return jsonResult({ success: true, source: 'github', issues: res.issues ?? [] });
    },
  };
}

export function createGithubCreateIssueTool(): AnyAgentTool {
  return {
    label: 'Create GitHub issue',
    name: 'github_create_issue',
    description: 'Create a GitHub issue in a synced repo (writes to GitHub). Source: GitHub.',
    parameters: Type.Object({
      repo_id: RepoIdSchema,
      title: Type.String({ description: 'Issue title.' }),
      body: Type.Optional(Type.String({ description: 'Issue body (Markdown). Add due:YYYY-MM-DD for calendar.' })),
      milestone_number: Type.Optional(Type.Number({ description: 'Milestone number to assign.' })),
      labels: Type.Optional(Type.Array(Type.String(), { description: 'Labels.' })),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const repoId = readStringParam(params, 'repo_id', { required: true });
      const title = readStringParam(params, 'title', { required: true });
      const res = await githubClient.issues.create(repoId!, {
        title: title!,
        body: readStringParam(params, 'body') ?? undefined,
        milestoneNumber: readNumberParam(params, 'milestone_number') ?? undefined,
        labels: Array.isArray(params.labels) ? (params.labels as string[]) : undefined,
      });
      if (!res.success) return jsonResult({ success: false, error: res.error });
      return jsonResult({ success: true, source: 'github', issue: res.issue });
    },
  };
}

export function createGithubCreateMilestoneTool(): AnyAgentTool {
  return {
    label: 'Create GitHub milestone',
    name: 'github_create_milestone',
    description: 'Create a GitHub milestone in a synced repo (writes to GitHub). Source: GitHub.',
    parameters: Type.Object({
      repo_id: RepoIdSchema,
      title: Type.String({ description: 'Milestone title.' }),
      description: Type.Optional(Type.String({ description: 'Optional description (Markdown).' })),
      due_on: Type.Optional(Type.String({ description: 'Optional due date ISO 8601 (e.g. 2026-12-31).' })),
      state: Type.Optional(Type.Union([Type.Literal('open'), Type.Literal('closed')])),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const repoId = readStringParam(params, 'repo_id', { required: true });
      const title = readStringParam(params, 'title', { required: true });
      const dueOnStr = readStringParam(params, 'due_on');
      const res = await githubClient.milestones.create(repoId!, {
        title: title!,
        description: readStringParam(params, 'description') ?? undefined,
        dueOn: dueOnStr ? Date.parse(dueOnStr) : undefined,
        state: readStringParam(params, 'state') ?? undefined,
      });
      if (!res.success) return jsonResult({ success: false, error: res.error });
      return jsonResult({ success: true, source: 'github', milestone: res.milestone });
    },
  };
}

export function createGithubUpdateIssueTool(): AnyAgentTool {
  return {
    label: 'Update GitHub issue',
    name: 'github_update_issue',
    description: 'Update a GitHub issue (writes to GitHub). Source: GitHub.',
    parameters: Type.Object({
      issue_id: Type.String({ description: 'Dome issue id from github_list_issues.' }),
      title: Type.Optional(Type.String()),
      body: Type.Optional(Type.String()),
      state: Type.Optional(Type.Union([Type.Literal('open'), Type.Literal('closed')])),
      milestone_number: Type.Optional(Type.Number({ description: 'Milestone number, or omit to leave unchanged.' })),
    }),
    execute: async (_id, args) => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const params = args as Record<string, unknown>;
      const issueId = readStringParam(params, 'issue_id', { required: true });
      const patch: Record<string, unknown> = {};
      const title = readStringParam(params, 'title');
      const body = readStringParam(params, 'body');
      const state = readStringParam(params, 'state');
      if (title != null) patch.title = title;
      if (body != null) patch.body = body;
      if (state === 'open' || state === 'closed') patch.state = state;
      if (params.milestone_number !== undefined) patch.milestoneNumber = params.milestone_number;
      const res = await githubClient.issues.update(issueId!, patch);
      if (!res.success) return jsonResult({ success: false, error: res.error });
      return jsonResult({ success: true, source: 'github', issue: res.issue });
    },
  };
}

export function createGithubSyncTool(): AnyAgentTool {
  return {
    label: 'Sync GitHub',
    name: 'github_sync',
    description: 'Trigger GitHub ↔ Dome sync now (pull milestones/issues, refresh calendar). Source: GitHub.',
    parameters: Type.Object({}),
    execute: async () => {
      const blocked = requireElectron();
      if (blocked) return blocked;
      const res = await githubClient.syncNow();
      if (!res.success) return jsonResult({ success: false, error: res.error });
      return jsonResult({ source: 'github', ...res });
    },
  };
}

export function createGithubTools(): AnyAgentTool[] {
  return [
    createGithubUpcomingMilestonesTool(),
    createGithubListReposTool(),
    createGithubListMilestonesTool(),
    createGithubListIssuesTool(),
    createGithubCreateIssueTool(),
    createGithubCreateMilestoneTool(),
    createGithubUpdateIssueTool(),
    createGithubSyncTool(),
  ];
}

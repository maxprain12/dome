/**
 * @dome/tools — `github` family definitions (domains/github/*).
 */

import type { ToolDefinition } from '../types.js';
import { githubListReposDefinition } from '../domains/github/github_list_repos/definition.js';
import { githubUpcomingMilestonesDefinition } from '../domains/github/github_upcoming_milestones/definition.js';
import { githubListMilestonesDefinition } from '../domains/github/github_list_milestones/definition.js';
import { githubListIssuesDefinition } from '../domains/github/github_list_issues/definition.js';
import { githubCreateIssueDefinition } from '../domains/github/github_create_issue/definition.js';
import { githubUpdateIssueDefinition } from '../domains/github/github_update_issue/definition.js';
import { githubCreateMilestoneDefinition } from '../domains/github/github_create_milestone/definition.js';
import { githubSyncDefinition } from '../domains/github/github_sync/definition.js';

export const GITHUB_TOOL_NAMES = [
  'github_list_repos',
  'github_upcoming_milestones',
  'github_list_milestones',
  'github_list_issues',
  'github_create_issue',
  'github_update_issue',
  'github_create_milestone',
  'github_sync',
] as const;

export type GithubToolName = (typeof GITHUB_TOOL_NAMES)[number];

export function githubToolDefinitions(): ToolDefinition[] {
  return [
    githubListReposDefinition,
    githubUpcomingMilestonesDefinition,
    githubListMilestonesDefinition,
    githubListIssuesDefinition,
    githubCreateIssueDefinition,
    githubUpdateIssueDefinition,
    githubCreateMilestoneDefinition,
    githubSyncDefinition,
  ];
}

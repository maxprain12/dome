import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const githubRepos = sqliteTable('github_repos', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().default('default'),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  defaultBranch: text('default_branch'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const githubMilestones = sqliteTable('github_milestones', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  state: text('state').notNull(),
  dueOn: integer('due_on'),
  closedAt: integer('closed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const githubIssues = sqliteTable('github_issues', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  state: text('state').notNull(),
  labelsJson: text('labels_json'),
  assigneesJson: text('assignees_json'),
  milestoneId: text('milestone_id'),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const githubBranches = sqliteTable('github_branches', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull(),
  name: text('name').notNull(),
  sha: text('sha'),
  protected: integer('protected').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

export const githubReleases = sqliteTable('github_releases', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull(),
  tagName: text('tag_name').notNull(),
  name: text('name'),
  body: text('body'),
  draft: integer('draft').notNull().default(0),
  prerelease: integer('prerelease').notNull().default(0),
  publishedAt: integer('published_at'),
  createdAt: integer('created_at').notNull(),
});

export const githubSyncState = sqliteTable('github_sync_state', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull(),
  entityType: text('entity_type').notNull(),
  cursor: text('cursor'),
  lastSyncedAt: integer('last_synced_at'),
  metadataJson: text('metadata_json'),
});

export const githubCalendarLinks = sqliteTable('github_calendar_links', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull(),
  calendarEventId: text('calendar_event_id').notNull(),
  linkType: text('link_type').notNull(),
  externalRef: text('external_ref'),
  createdAt: integer('created_at').notNull(),
});

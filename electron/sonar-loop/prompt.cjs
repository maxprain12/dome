const fs = require('fs');
const path = require('path');

const SONAR_TOOL_IDS = ['file_read', 'file_write', 'shell_exec'];

function getSonarLoopToolDefinitions() {
  const { getToolDefinitionsByIds } = require('../tools/tool-dispatcher.cjs');
  return getToolDefinitionsByIds(SONAR_TOOL_IDS);
}

function loadPromptTemplate(repoRoot) {
  const promptPath = path.join(repoRoot, '.cursor/prompts/sonar-fix-batch.md');
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, 'utf8');
  }
  return [
    'Fix SonarQube issues in this repo with minimal diffs.',
    'Use file_read, file_write, shell_exec only inside the repo root.',
    'Run typecheck, lint, test:coverage before finishing.',
    'Do not merge — stop after edits are done (CI opens the PR).',
  ].join('\n');
}

function formatIssue(issue) {
  const component = String(issue.component || '');
  const file = component.includes(':') ? component.split(':').slice(1).join(':') : component;
  const line = issue.line ? `:${issue.line}` : '';
  return [
    `- **Sonar key**: ${issue.key || issue.sonarKey || 'unknown'}`,
    `  **Rule**: ${issue.rule || 'unknown'}`,
    `  **File**: ${file}${line}`,
    `  **Message**: ${issue.message || issue.title || ''}`,
    issue.githubNumber ? `  **GitHub issue**: #${issue.githubNumber}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSonarLoopMessages(batchPayload, repoRoot) {
  const template = loadPromptTemplate(repoRoot);
  const issues = batchPayload.batch || [];
  const issueBlock =
    issues.length > 0
      ? issues.map(formatIssue).join('\n\n')
      : '_No issues in batch — pick batch failed or batch is empty._';

  const system = `${template}

## Runtime constraints
- Repository root (absolute): ${path.resolve(repoRoot)}
- Only modify files under this root.
- Allowed tools: file_read, file_write, shell_exec (pnpm/npm/git commands for verify only).
- skipHitl: automated CI — do not ask for approval.
- When done, reply with a short summary: files changed, Sonar keys addressed, tests run.`;

  const user = `Process this Sonar batch (max ${issues.length} issues):

${issueBlock}

Steps:
1. Read each reported file at the indicated line.
2. Apply the smallest fix per Sonar rule.
3. Run: pnpm run typecheck && pnpm run lint && pnpm run build:packages && pnpm run test:coverage
4. Summarize what you changed.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

module.exports = {
  SONAR_TOOL_IDS,
  getSonarLoopToolDefinitions,
  buildSonarLoopMessages,
};

const fs = require('fs');
const path = require('path');

const SONAR_TOOL_IDS = ['file_read', 'file_write', 'shell_exec'];

/** Lean CI prompt — avoids PR/branch steps Jenkins handles separately. */
const CI_PROMPT = `# Sonar quality loop (Jenkins CI)

Fix the Sonar issues listed below with **minimal, targeted diffs**. Jenkins will commit, verify again, and open the PR — you only edit source files.

## Workflow (strict)
1. For each issue: \`file_read\` the reported file — prefer reading only ±40 lines around the reported line when the file is large.
2. Apply the **smallest** change that satisfies the Sonar rule and message.
3. Do **not** refactor, rename, or touch unrelated code.
4. Do **not** create branches, commits, PRs, or run \`git\` except verify commands below.
5. After all issues: run verify **once** (not per file):
   \`pnpm run typecheck && pnpm run lint && pnpm run build:packages && pnpm run test:coverage\`

## Tool discipline
- Allowed: \`file_read\`, \`file_write\`, \`shell_exec\` (pnpm/npm only for verify).
- Do not list or explore the whole tree — go straight to reported paths.
- Do not load large generated/vendor files.
- **Never replace an entire file** with a snippet — use minimal edits at the reported line only.
- \`app/globals.css\` and \`electron/mcp/mcp-client.cjs\` are large: patch in place; deleting thousands of lines is a failure.
- skipHitl: automated CI — never ask for approval.

## Priority
SECURITY → RELIABILITY → maintainability (void operator, complexity).

## Finish
Reply with: files changed | Sonar keys addressed | verify pass/fail.`;

function getSonarLoopToolDefinitions() {
  const { getToolDefinitionsByIds } = require('../tools/tool-dispatcher.cjs');
  return getToolDefinitionsByIds(SONAR_TOOL_IDS);
}

function isCiHarness() {
  return (
    process.env.SONAR_LOOP_NODE === '1' ||
    process.env.SONAR_LOOP_NODE === 'true' ||
    Boolean(process.env.JENKINS_URL)
  );
}

function loadPromptTemplate(repoRoot) {
  if (isCiHarness()) return CI_PROMPT;

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
  const impact = issue.impacts?.[0]?.softwareQuality || '';
  return [
    `### ${issue.key || issue.sonarKey || 'unknown'}`,
    `- Rule: \`${issue.rule || 'unknown'}\`${impact ? ` (${impact})` : ''}`,
    `- File: \`${file}${line}\``,
    `- Message: ${issue.message || issue.title || ''}`,
    issue.githubNumber ? `- GitHub: #${issue.githubNumber}` : null,
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
      : '_No issues in batch._';

  const repoAbs = path.resolve(repoRoot);
  const system = `${template}

## Runtime
- Repo root: \`${repoAbs}\`
- Modify files only under this root.`;

  const user = `Fix these ${issues.length} Sonar issue(s):

${issueBlock}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

module.exports = {
  SONAR_TOOL_IDS,
  getSonarLoopToolDefinitions,
  buildSonarLoopMessages,
  CI_PROMPT,
};

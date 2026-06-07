/* eslint-disable no-console */
/**
 * Minimal system prompt for benchmark runs — uses shared assembler.
 */
const {
  buildBenchPrompt,
  buildCoreToolsBlock,
  PROMPT_VERSION,
} = require('../../shared/prompt-assembler/index.cjs');
const { loadCorePromptSections } = require('../prompts/core-prompt-loader.cjs');

const BENCH_PROJECT_ID = 'bench-project';

const BENCH_RULES = `## Benchmark mode (CRITICAL)

You are running an **automated tool benchmark**, not a general chat session.

**Scope**
- Work **only** in project \`${BENCH_PROJECT_ID}\` and fixture resource IDs given in the user message.
- Do **NOT** explore Dome source code, \`Documents/dome\`, Electron paths, or the developer filesystem.
- Do **NOT** call \`project_list\`, \`get_library_overview\`, \`file_tree\`, \`file_list\`, \`shell_exec\`, or \`glob\` unless the user message explicitly asks for that exact tool.

**Execution style**
- Complete the user request in the **fewest steps** (ideally one primary tool call).
- Use the provider's **native tool_call API** only — never write XML like \`<invoke name="...">\` in plain text.
- Use exact resource IDs from the prompt — never invent IDs.
- If fixture IDs are provided, pass \`project_id: "${BENCH_PROJECT_ID}"\` on resource/studio tools.

**Responses**
- Be concise. No lengthy product analysis.
- If a tool fails, report briefly and stop.`;

function buildBenchSystemPrompt(caseDef, fixtureIds) {
  const core = loadCorePromptSections();
  const toolsBlock = buildCoreToolsBlock(core);
  const toolsExcerpt =
    toolsBlock.length > 4000 ? `${toolsBlock.slice(0, 4000)}\n…[truncated for bench]` : toolsBlock;

  const fixtureList =
    fixtureIds?.length > 0
      ? fixtureIds.map((id) => `- ${id}`).join('\n')
      : undefined;

  return buildBenchPrompt({
    intro: 'You are Many (Dome AI) in **benchmark mode**.',
    benchRules: BENCH_RULES,
    toolsExcerpt,
    fixtureList,
    primaryTool: caseDef?.tool,
    explainOnly: Boolean(caseDef?.explain_only),
  });
}

module.exports = {
  buildBenchSystemPrompt,
  BENCH_PROJECT_ID,
  BENCH_RULES,
  PROMPT_VERSION,
};

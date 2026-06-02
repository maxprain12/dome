/**
 * Renderer-side core prompt sections (bundled at build time via Vite ?raw).
 */
import roleMany from '../../../prompts/martin/core/role-many.txt?raw';
import constraintsLanguage from '../../../prompts/martin/core/constraints-language.txt?raw';
import appContext from '../../../prompts/martin/core/app-context.txt?raw';
import toolGuardrails from '../../../prompts/martin/core/tool-guardrails.txt?raw';
import toolSurface from '../../../prompts/martin/core/tool-surface.txt?raw';
import toolFormat from '../../../prompts/martin/core/tool-format.txt?raw';
import toolCatalog from '../../../prompts/martin/core/tool-catalog.txt?raw';
import filesystemRules from '../../../prompts/martin/core/filesystem-rules.txt?raw';
import asyncSubagents from '../../../prompts/martin/core/async-subagents.txt?raw';
import outputFormat from '../../../prompts/martin/core/output-format.txt?raw';
import referenceStub from '../../../prompts/martin/core/reference-stub.txt?raw';
import entityRules from '../../../prompts/martin/core/entity-rules.txt?raw';
import resourceLinks from '../../../prompts/martin/core/resource-links.txt?raw';
import martinTools from '../../../prompts/martin/tools.txt?raw';

import type { CorePromptSections } from '../../../shared/prompt-assembler/index.ts';

export const corePromptSections: CorePromptSections & {
  entityRules: string;
  resourceLinks: string;
} = {
  roleMany,
  constraintsLanguage,
  appContext,
  toolGuardrails,
  toolSurface,
  toolFormat,
  toolCatalog,
  filesystemRules,
  asyncSubagents,
  outputFormat,
  referenceStub,
  entityRules,
  resourceLinks,
};

/** Backward-compat monolithic tools block for bench imports */
export const martinToolsBlock = martinTools;

export function getCoreSectionsForAssembler(): CorePromptSections {
  return corePromptSections;
}

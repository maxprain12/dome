/**
 * Renderer-side core prompt sections (bundled at build time via Vite ?raw).
 */
import roleMany from '../../../packages/prompts/sections/role-many.txt?raw';
import constraintsLanguage from '../../../packages/prompts/sections/constraints-language.txt?raw';
import appContext from '../../../packages/prompts/sections/app-context.txt?raw';
import toolGuardrails from '../../../packages/prompts/sections/tool-guardrails.txt?raw';
import toolSurface from '../../../packages/prompts/sections/tool-surface.txt?raw';
import toolFormat from '../../../packages/prompts/sections/tool-format.txt?raw';
import toolCatalog from '../../../packages/prompts/sections/tool-catalog.txt?raw';
import filesystemRules from '../../../packages/prompts/sections/filesystem-rules.txt?raw';
import outputFormat from '../../../packages/prompts/sections/output-format.txt?raw';
import referenceStub from '../../../packages/prompts/sections/reference-stub.txt?raw';
import entityRules from '../../../packages/prompts/sections/entity-rules.txt?raw';
import resourceLinks from '../../../packages/prompts/sections/resource-links.txt?raw';
import toolsIndex from '../../../packages/prompts/sections/tools-index.txt?raw';

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
  outputFormat,
  referenceStub,
  entityRules,
  resourceLinks,
};

/** Backward-compat monolithic tools block for bench imports */
export const martinToolsBlock = toolsIndex;

export function getCoreSectionsForAssembler(): CorePromptSections {
  return corePromptSections;
}

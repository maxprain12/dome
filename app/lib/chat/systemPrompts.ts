/**
 * Shared system-prompt fragments — re-exported from core text files for backward compatibility.
 */
import { corePromptSections } from '@/lib/prompt-assembler/coreSections';

export const RESOURCE_LINK_INSTRUCTION = corePromptSections.resourceLinks;
export const ENTITY_CREATION_RULES = corePromptSections.entityRules;
export const APP_SECTION_GUIDE = (corePromptSections.appContext ?? '').replace(/^Context:\n/, '');

/** @deprecated Consolidated into prompts/martin/core/tool-surface.txt */
export const TOOL_USAGE_MODE = '';

/** @deprecated Consolidated into prompts/martin/core/output-format.txt */
export const CHAT_CITATION_INSTRUCTION = '';

export { buildVoiceSuffix } from '@/lib/prompt-assembler/bridge';

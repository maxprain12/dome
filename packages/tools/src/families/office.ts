/**
 * @dome/tools — `office` family aggregator (Excel + Word + PowerPoint).
 *
 * Mirrors `resources.ts` at the family level: `OFFICE_TOOL_NAMES` and
 * `officeToolDefinitions()` concatenate the three sub-modules
 * (`office/{excel,docx,ppt}.ts`). Renderer-safe (no Node deps).
 */

import type { ToolDefinition } from '../types.js';
import { EXCEL_TOOL_NAMES, excelToolDefinitions } from './office/excel.js';
import { DOCX_TOOL_NAMES, docxToolDefinitions } from './office/docx.js';
import { PPT_TOOL_NAMES, pptToolDefinitions } from './office/ppt.js';

export {
  EXCEL_TOOL_NAMES,
  excelToolDefinitions,
  DOCX_TOOL_NAMES,
  docxToolDefinitions,
  PPT_TOOL_NAMES,
  pptToolDefinitions,
};
export type { ExcelToolName } from './office/excel.js';
export type { DocxToolName } from './office/docx.js';
export type { PptToolName } from './office/ppt.js';

/** All office-family tool names (subset of the 103-tool catalog). */
export const OFFICE_TOOL_NAMES = [
  ...EXCEL_TOOL_NAMES,
  ...DOCX_TOOL_NAMES,
  ...PPT_TOOL_NAMES,
] as const;

export type OfficeToolName = (typeof OFFICE_TOOL_NAMES)[number];

export function officeToolDefinitions(): ToolDefinition[] {
  return [...excelToolDefinitions(), ...docxToolDefinitions(), ...pptToolDefinitions()];
}

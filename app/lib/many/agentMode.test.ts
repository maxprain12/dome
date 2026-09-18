import { describe, expect, it } from 'vitest';
import {
  extractPlanTodos,
  filterSlashModes,
  filterToolIdsForAgentMode,
  modeFromSlashId,
  parseComposerModeCommand,
  parseManyAgentMode,
  promptOverlayForAgentMode,
} from './agentMode';

describe('many agentMode', () => {
  it('parses plan/draft/agent and ignores unknown values', () => {
    expect(parseManyAgentMode('PLAN')).toBe('plan');
    expect(parseManyAgentMode('draft')).toBe('draft');
    expect(parseManyAgentMode('ask')).toBe('agent');
  });

  it('turns /plan /draft /agent into explicit mode changes', () => {
    expect(parseComposerModeCommand('/plan')).toBe('plan');
    expect(parseComposerModeCommand('/DRAFT')).toBe('draft');
    expect(parseComposerModeCommand('/agent')).toBe('agent');
    expect(parseComposerModeCommand('/plan now')).toBeNull();
    expect(filterSlashModes('pl')).toEqual(['plan']);
    expect(filterSlashModes('')).toEqual(['plan', 'draft', 'agent']);
    expect(modeFromSlashId('mode:draft')).toBe('draft');
    expect(modeFromSlashId('pptx')).toBeNull();
  });

  it('strips write tools in plan mode and injects questionnaire', () => {
    expect(filterToolIdsForAgentMode(['resource_search', 'resource_create', 'web_search'], 'plan')).toEqual([
      'resource_search',
      'web_search',
      'questionnaire',
    ]);
    expect(filterToolIdsForAgentMode(['resource_create', 'questionnaire'], 'agent')).toEqual(['resource_create']);
  });

  it('extracts numbered Plan: steps', () => {
    const todos = extractPlanTodos('Intro\n\nPlan:\n1. Leer el syllabus\n2. Redactar un esquema\n\nNotas extra');
    expect(todos).toEqual(['Leer el syllabus', 'Redactar un esquema']);
  });

  it('returns PI-style overlays', () => {
    expect(promptOverlayForAgentMode('plan')).toContain('questionnaire tool');
    expect(promptOverlayForAgentMode('plan')).toContain('```mermaid');
    expect(promptOverlayForAgentMode('draft')).toContain('DRAFT MODE ACTIVE');
    expect(promptOverlayForAgentMode('agent')).toBeNull();
  });
});

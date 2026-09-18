import { describe, expect, it } from 'vitest';
import {
  extractMermaidDiagrams,
  extractPlanTodoItems,
  extractPlanDocument,
  formatExecutePrompt,
  formatQuestionnaireResult,
  markCompletedSteps,
  parseQuestionnaireQuestions,
  questionnaireFromActionRequests,
} from './planDocument';

describe('planDocument questionnaire', () => {
  it('parses PI questions with Type something on by default', () => {
    const questions = parseQuestionnaireQuestions({
      questions: [
        {
          id: 'scope',
          label: 'Scope',
          prompt: 'What should we cover?',
          options: [{ value: 'full', label: 'Full review' }, { label: 'Outline only' }],
        },
      ],
    });
    expect(questions).toHaveLength(1);
    expect(questions[0].label).toBe('Scope');
    expect(questions[0].allowOther).toBe(true);
    expect(questions[0].options[1].label).toBe('Outline only');
  });

  it('formats selected and typed answers without exposing option ids as the result', () => {
    const questions = parseQuestionnaireQuestions({
      questions: [{ id: 'scope', label: 'Scope', prompt: 'Cover?', options: [{ value: 'abc', label: 'Full' }] }],
    });
    expect(
      formatQuestionnaireResult(questions, [{ id: 'scope', value: 'abc', label: 'Full', wasCustom: false, index: 1 }], false),
    ).toBe('Scope: user selected: 1. Full');
    expect(
      formatQuestionnaireResult(questions, [{ id: 'scope', value: 'notes', label: 'Just notes', wasCustom: true }], false),
    ).toBe('Scope: user wrote: Just notes');
    expect(formatQuestionnaireResult(questions, [], true)).toBe('User cancelled the questionnaire');
  });

  it('reads questionnaire args from HITL action requests', () => {
    const questions = questionnaireFromActionRequests([
      {
        name: 'questionnaire',
        args: { questions: [{ prompt: 'Priority?', options: ['High', 'Low'] }] },
      },
    ]);
    expect(questions[0].prompt).toBe('Priority?');
    expect(questions[0].options.map((row) => row.label)).toEqual(['High', 'Low']);
  });
});

describe('planDocument todos', () => {
  it('extracts numbered Plan: steps and marks [DONE:n]', () => {
    const todos = extractPlanTodoItems('Intro\n\nPlan:\n1. Leer el syllabus\n2. Redactar un esquema\n\nNotas');
    expect(todos.map((row) => row.text)).toEqual(['Leer el syllabus', 'Redactar un esquema']);
    const marked = markCompletedSteps('Step one is done [DONE:1]', todos);
    expect(marked[0].completed).toBe(true);
    expect(marked[1].completed).toBe(false);
    expect(formatExecutePrompt(marked)).toContain('2. Redactar un esquema');
    expect(formatExecutePrompt(marked)).toContain('[DONE:n]');
  });

  it('extracts a plan offer without a Plan: header so Execute can appear', () => {
    const text = [
      'Identidad ADVO para la presentación',
      '',
      '• Privacidad: repos privados.',
      '',
      '¿Apruebas el plan con la identidad ADVO aplicada? Cuando me digas "Ejecuta" arranco los pasos 1-6.',
    ].join('\n');
    const document = extractPlanDocument(text);
    expect(document?.title).toContain('Identidad ADVO');
    expect(document?.todos.length).toBeGreaterThan(0);
    expect(document?.body).toContain('Privacidad');
  });

  it('extracts numbered steps without a Plan: header', () => {
    const todos = extractPlanTodoItems('Resumen\n\n1. Abrir el deck\n2. Aplicar el monograma\n3. Exportar PDF');
    expect(todos.map((row) => row.text)).toEqual(['Abrir el deck', 'Aplicar el monograma', 'Exportar PDF']);
  });

  it('extracts mermaid fences from the plan body', () => {
    const diagrams = extractMermaidDiagrams(
      'Plan:\n1. Mapear el flujo\n\n```mermaid\nflowchart LR\n  A[Leer] --> B[Escribir]\n```\n',
    );
    expect(diagrams).toEqual(['flowchart LR\n  A[Leer] --> B[Escribir]']);
  });
});

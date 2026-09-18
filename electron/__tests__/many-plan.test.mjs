import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  formatQuestionnaireResult,
  parseQuestionnaireQuestions,
  extractPlanTodoItems,
  extractPlanDocument,
  markCompletedSteps,
  publicApprovalPayload,
  publicPlanPayload,
  resumeDecisionsFromRemotePayload,
} = require('../agents/many-plan.cjs');
const { HITL_TOOL_NAMES, buildBeforeToolCall, HitlInterruptError } = require('../agents/agent-runtime.cjs');

describe('many-plan questionnaire', () => {
  it('formats cancelled and Type something answers', () => {
    const questions = parseQuestionnaireQuestions({
      questions: [{ id: 'scope', label: 'Scope', prompt: 'Cover?', options: [{ label: 'Full' }] }],
    });
    assert.equal(formatQuestionnaireResult(questions, [], true), 'User cancelled the questionnaire');
    assert.equal(
      formatQuestionnaireResult(
        questions,
        [{ id: 'scope', value: 'custom', label: 'Just notes', wasCustom: true }],
        false,
      ),
      'Scope: user wrote: Just notes',
    );
  });

  it('publishes a compact questionnaire approval without dumping raw args', () => {
    const payload = publicApprovalPayload({
      kind: 'questionnaire',
      runId: 'run-1',
      actionRequests: [{
        name: 'questionnaire',
        args: {
          questions: [{ id: 'q1', label: 'Scope', prompt: 'Cover?', options: [{ value: 'uuid-secret', label: 'Full' }] }],
        },
      }],
    });
    assert.equal(payload.kind, 'questionnaire');
    assert.equal(payload.questions[0].label, 'Scope');
    assert.equal(payload.questions[0].options[0].label, 'Full');
    assert.ok(!JSON.stringify(payload).includes('uuid-secret') || payload.questions[0].options[0].value);
  });

  it('resumes questionnaire with answers or cancel', () => {
    assert.deepEqual(
      resumeDecisionsFromRemotePayload({ cancelled: true }),
      [{ type: 'reject', cancelled: true }],
    );
    assert.deepEqual(
      resumeDecisionsFromRemotePayload({
        answers: [{ id: 'scope', label: 'Full', value: 'full' }],
      }),
      [{ type: 'approve', answers: [{ id: 'scope', label: 'Full', value: 'full' }] }],
    );
  });

  it('interrupts questionnaire HITL and skips the per-tool cap', async () => {
    assert.equal(HITL_TOOL_NAMES.has('questionnaire'), true);
    const before = buildBeforeToolCall({
      hitlInterrupt: true,
      requiresApproval: new Set(['questionnaire']),
    });
    const messages = [{
      role: 'assistant',
      content: Array.from({ length: 20 }, (_, i) => ({ type: 'toolCall', id: `tc_${i}`, name: 'questionnaire' })),
    }];
    await assert.rejects(
      () => before({ toolCall: { id: 'q', name: 'questionnaire', arguments: {} }, context: { messages } }),
      (err) => err instanceof HitlInterruptError && err.toolCall.name === 'questionnaire',
    );
  });
});

describe('many-plan todos', () => {
  it('extracts Plan: steps and compact plan events', () => {
    const todos = extractPlanTodoItems('Plan:\n1. First step here\n2. Second step here');
    assert.equal(todos.length, 2);
    const marked = markCompletedSteps('Done [DONE:1]', todos);
    assert.equal(marked[0].completed, true);
    const payload = publicPlanPayload(marked, 'executing');
    assert.equal(payload.kind, 'plan');
    assert.equal(payload.phase, 'executing');
    assert.equal(payload.todos[0].text, 'First step here');
  });

  it('extracts an execute offer without Plan: header', () => {
    const document = extractPlanDocument(
      'Identidad ADVO para slides\n\n¿Apruebas el plan? Cuando me digas "Ejecuta" arranco los pasos 1-6.',
    );
    assert.ok(document);
    assert.equal(document.todos.length, 1);
    const payload = publicPlanPayload(document.todos, 'choose', document);
    assert.equal(payload.title, 'Identidad ADVO para slides');
    assert.match(String(payload.excerpt), /Apruebas el plan/);
  });
});

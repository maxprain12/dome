'use strict';

const QUESTIONNAIRE_TOOL_NAME = 'questionnaire';
const OTHER_OPTION_VALUE = '__other__';

const QUESTIONNAIRE_TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: QUESTIONNAIRE_TOOL_NAME,
    description:
      'Ask the user one or more clarifying questions. Use for requirements, preferences, or decisions. Each question is single-choice. Do not dump questions as markdown bullets.',
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: 'Questions to ask the user',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Stable id for this question' },
              label: {
                type: 'string',
                description: 'Short tab label, e.g. Scope or Priority',
              },
              prompt: { type: 'string', description: 'Full question text' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    value: { type: 'string' },
                    label: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['label'],
                },
              },
              allowOther: {
                type: 'boolean',
                description: 'Allow Type something (default true)',
              },
            },
            required: ['prompt', 'options'],
          },
        },
      },
      required: ['questions'],
    },
  },
};

function humanLabel(raw, fallback) {
  const text = String(raw || '').trim();
  if (!text) return fallback;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text)) return fallback;
  if (/^(mode:|sp-|scamp-|soc-)/i.test(text)) return fallback;
  return text;
}

function parseOption(raw, index) {
  if (typeof raw === 'string') {
    const label = raw.trim();
    if (!label) return null;
    return { value: label, label };
  }
  if (!raw || typeof raw !== 'object') return null;
  const label = humanLabel(raw.label, '');
  const value = String(raw.value || label).trim();
  if (!label && !value) return null;
  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : undefined;
  return {
    value: value || `opt-${index + 1}`,
    label: label || `Option ${index + 1}`,
    description,
  };
}

function parseQuestion(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || `q${index + 1}`).trim() || `q${index + 1}`;
  const prompt = String(raw.prompt || raw.question || '').trim();
  if (!prompt) return null;
  const options = Array.isArray(raw.options)
    ? raw.options.map((option, optionIndex) => parseOption(option, optionIndex)).filter(Boolean)
    : [];
  if (options.length === 0) return null;
  return {
    id,
    label: humanLabel(raw.label, `Q${index + 1}`),
    prompt,
    options,
    allowOther: raw.allowOther !== false,
  };
}

function parseQuestionnaireQuestions(raw) {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.questions : raw;
  if (!Array.isArray(source)) return [];
  return source.map((row, index) => parseQuestion(row, index)).filter(Boolean);
}

function formatQuestionnaireResult(questions, answers, cancelled) {
  if (cancelled) return 'User cancelled the questionnaire';
  const list = Array.isArray(answers) ? answers : [];
  return list
    .map((answer) => {
      const question = (questions || []).find((row) => row.id === answer.id);
      const qLabel = question?.label || answer.id;
      if (answer.wasCustom) return `${qLabel}: user wrote: ${answer.label}`;
      const index = answer.index ? `${answer.index}. ` : '';
      return `${qLabel}: user selected: ${index}${answer.label}`;
    })
    .join('\n');
}

function parsePlanTodos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        return { step: index + 1, text, completed: false };
      }
      if (!item || typeof item !== 'object') return null;
      const text = String(item.text || '').trim();
      if (!text) return null;
      const step = Number(item.step);
      return {
        step: Number.isFinite(step) && step > 0 ? step : index + 1,
        text,
        completed: item.completed === true,
      };
    })
    .filter(Boolean)
    .slice(0, 24);
}

const PLAN_STEP_RE = /^\s{0,3}(\d+)[.)]\s+\*{0,2}([^*\n]+)/;
const PLAN_CHECK_RE = /^\s{0,3}[-*•]\s+\[[ xX]\]\s+(.+)/;
const PLAN_HEADER_RE = /\*{0,2}#{0,3}\s*plan\s*:?\*{0,2}\s*\n/i;
const PLAN_OFFER_RE =
  /(apruebas el plan|approve the plan|cuando me digas .{0,12}ejecuta|say .{0,12}execute|dime .{0,8}ejecuta)/i;
const MAX_PLAN_BODY_CHARS = 12000;
const MAX_PLAN_EXCERPT_CHARS = 180;

function numberedItemsFrom(source) {
  const items = [];
  for (const line of String(source || '').split('\n')) {
    const match = PLAN_STEP_RE.exec(line);
    if (!match) continue;
    const textLine = match[2].replace(/\*{1,2}$/, '').trim();
    if (textLine.length < 3) continue;
    items.push({ step: items.length + 1, text: textLine, completed: false });
  }
  return items.slice(0, 24);
}

function checkboxItemsFrom(source) {
  const items = [];
  for (const line of String(source || '').split('\n')) {
    const match = PLAN_CHECK_RE.exec(line);
    if (!match) continue;
    const textLine = match[1].replace(/\*{1,2}/g, '').trim();
    if (textLine.length < 3) continue;
    items.push({ step: items.length + 1, text: textLine, completed: false });
  }
  return items.slice(0, 24);
}

function looksLikePlanOffer(text) {
  return PLAN_OFFER_RE.test(String(text || ''));
}

function extractPlanTitle(text) {
  const source = String(text || '');
  const heading = source.match(/^\s{0,3}#{1,3}\s+(.+)$/m);
  if (heading && heading[1]) {
    const label = heading[1].replace(/\*{1,2}/g, '').trim();
    if (label.length >= 3 && !looksLikePlanOffer(label)) return label.slice(0, 80);
  }
  for (const line of source.split('\n')) {
    const trimmed = line.replace(/^#{1,6}\s+/, '').replace(/\*{1,2}/g, '').trim();
    if (trimmed.length < 8) continue;
    if (/^[-*•]/.test(trimmed)) continue;
    if (trimmed.endsWith('?')) continue;
    if (PLAN_STEP_RE.test(line)) continue;
    return trimmed.slice(0, 80);
  }
  return 'Plan';
}

function extractPlanExcerpt(text, todos) {
  const compact = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length >= 24) return compact.slice(0, MAX_PLAN_EXCERPT_CHARS);
  const list = Array.isArray(todos) ? todos.map((item) => item.text).join(' · ') : '';
  return (list || compact).slice(0, MAX_PLAN_EXCERPT_CHARS);
}

function extractPlanTodoItems(text) {
  const source = String(text || '');
  const header = source.match(PLAN_HEADER_RE);
  if (header && header.index != null) {
    const fromHeader = numberedItemsFrom(source.slice(header.index + header[0].length));
    if (fromHeader.length >= 2) return fromHeader;
  }
  const numbered = numberedItemsFrom(source);
  if (numbered.length >= 2) return numbered;
  const checks = checkboxItemsFrom(source);
  if (checks.length >= 2) return checks;
  if (looksLikePlanOffer(source)) {
    return [{ step: 1, text: extractPlanTitle(source), completed: false }];
  }
  return [];
}

function extractPlanDocument(text) {
  const source = String(text || '').trim();
  if (!source) return null;
  const todos = extractPlanTodoItems(source);
  if (todos.length === 0) return null;
  const title = extractPlanTitle(source);
  const body = source.slice(0, MAX_PLAN_BODY_CHARS);
  return {
    title,
    body,
    excerpt: extractPlanExcerpt(source, todos),
    todos,
  };
}

function extractDoneSteps(text) {
  const steps = [];
  for (const match of String(text || '').matchAll(/\[DONE:(\d+)\]/gi)) {
    const step = Number(match[1]);
    if (Number.isFinite(step)) steps.push(step);
  }
  return steps;
}

function markCompletedSteps(text, items) {
  const done = new Set(extractDoneSteps(text));
  if (done.size === 0) return items || [];
  return (items || []).map((item) => (done.has(item.step) ? { ...item, completed: true } : item));
}

function remainingPlanTodos(items) {
  return (items || []).filter((item) => !item.completed);
}

function formatExecutePrompt(items, body) {
  const remaining = remainingPlanTodos(items);
  const first = remaining[0];
  const list = remaining.map((item) => `${item.step}. ${item.text}`).join('\n');
  const start = first ? `\nStart with: ${first.text}` : '';
  const trimmedBody = String(body || '').trim();
  const planBlock = trimmedBody ? `\n\nPlan:\n${trimmedBody.slice(0, MAX_PLAN_BODY_CHARS)}` : '';
  return `Execute the plan.${planBlock}\n\nRemaining steps:\n${list}${start}\nAfter completing a step, include a [DONE:n] tag in your response.`;
}

function formatRefinePrompt(items, refinement, body) {
  const list = (items || []).map((item) => `${item.step}. ${item.text}`).join('\n');
  const trimmedBody = String(body || '').trim();
  const planBlock = trimmedBody
    ? `\n\nPlan:\n${trimmedBody.slice(0, MAX_PLAN_BODY_CHARS)}`
    : `\n\nCurrent plan:\n${list}`;
  return `${String(refinement || '').trim()}${planBlock}`;
}

function isQuestionnaireTool(name) {
  return String(name || '').trim() === QUESTIONNAIRE_TOOL_NAME;
}

function publicQuestionnairePayload(raw) {
  return {
    kind: 'questionnaire',
    questions: parseQuestionnaireQuestions(raw).map((question) => ({
      id: question.id,
      label: question.label,
      prompt: question.prompt,
      allowOther: question.allowOther !== false,
      options: question.options.map((option) => ({
        value: option.value,
        label: option.label,
        description: option.description,
      })),
    })),
  };
}

function publicApprovalPayload(pending) {
  const first = Array.isArray(pending?.actionRequests) ? pending.actionRequests[0] : null;
  const name = first?.name || '';
  if (isQuestionnaireTool(name) || pending?.kind === 'questionnaire') {
    return {
      ...publicQuestionnairePayload(first?.args || pending),
      runId: pending?.runId || null,
      toolCallId: pending?.pendingToolCall?.id || first?.id || null,
    };
  }
  return {
    kind: pending?.kind || 'tool',
    summary: first?.description || name || 'tool',
    toolName: name || null,
    runId: pending?.runId || null,
    toolCallId: pending?.pendingToolCall?.id || first?.id || null,
  };
}

function publicPlanPayload(todos, phase, document) {
  const parsed = parsePlanTodos(todos);
  const title = String(document?.title || '').trim().slice(0, 80);
  const body = String(document?.body || '').trim().slice(0, 8000);
  const excerpt = String(document?.excerpt || extractPlanExcerpt(body, parsed)).trim().slice(0, MAX_PLAN_EXCERPT_CHARS);
  return {
    kind: 'plan',
    phase: phase === 'executing' ? 'executing' : 'choose',
    title: title || null,
    excerpt: excerpt || null,
    body: body || null,
    todos: parsed.map((item) => ({
      step: item.step,
      text: item.text,
      completed: item.completed === true,
    })),
  };
}

function resumeDecisionsFromRemotePayload(payload) {
  if (!payload || typeof payload !== 'object') return [{ type: 'reject' }];
  if (payload.cancelled === true) return [{ type: 'reject', cancelled: true }];
  if (Array.isArray(payload.answers)) {
    return [{ type: 'approve', answers: payload.answers }];
  }
  const approved = payload.approved !== false;
  return [
    {
      type: approved ? 'approve' : 'reject',
      toolCallId: payload.toolCallId,
    },
  ];
}

module.exports = {
  QUESTIONNAIRE_TOOL_NAME,
  OTHER_OPTION_VALUE,
  QUESTIONNAIRE_TOOL_DEFINITION,
  parseQuestionnaireQuestions,
  formatQuestionnaireResult,
  parsePlanTodos,
  extractPlanTodoItems,
  extractPlanDocument,
  extractDoneSteps,
  markCompletedSteps,
  remainingPlanTodos,
  formatExecutePrompt,
  formatRefinePrompt,
  isQuestionnaireTool,
  publicQuestionnairePayload,
  publicApprovalPayload,
  publicPlanPayload,
  resumeDecisionsFromRemotePayload,
};

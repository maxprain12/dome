/** PI questionnaire + plan-mode todos. Labels are human; ids stay in values. */

export const QUESTIONNAIRE_TOOL_NAME = 'questionnaire';
export const OTHER_OPTION_VALUE = '__other__';

export interface PlanTodo {
  step: number;
  text: string;
  completed: boolean;
}

export interface PlanDocument {
  title: string;
  body: string;
  excerpt: string;
  todos: PlanTodo[];
}

export const MAX_PLAN_BODY_CHARS = 12_000;
export const MAX_PLAN_EXCERPT_CHARS = 180;

export interface QuestionnaireOption {
  value: string;
  label: string;
  description?: string;
}

export interface QuestionnaireQuestion {
  id: string;
  label: string;
  prompt: string;
  options: QuestionnaireOption[];
  allowOther: boolean;
}

export interface QuestionnaireAnswer {
  id: string;
  value: string;
  label: string;
  wasCustom: boolean;
  index?: number;
}

export function humanLabel(raw: unknown, fallback: string): string {
  const text = String(raw || '').trim();
  if (!text) return fallback;
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text)) return fallback;
  if (/^(mode:|sp-|scamp-|soc-)/i.test(text)) return fallback;
  return text;
}

export function parseQuestionnaireQuestions(raw: unknown): QuestionnaireQuestion[] {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as { questions?: unknown }).questions
      : raw;
  if (!Array.isArray(source)) return [];
  return source
    .map((row, index) => parseQuestion(row, index))
    .filter((row): row is QuestionnaireQuestion => row != null);
}

function parseQuestion(raw: unknown, index: number): QuestionnaireQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id || `q${index + 1}`).trim() || `q${index + 1}`;
  const prompt = String(row.prompt || row.question || '').trim();
  if (!prompt) return null;
  const options = Array.isArray(row.options)
    ? row.options
        .map((option, optionIndex) => parseOption(option, optionIndex))
        .filter((option): option is QuestionnaireOption => option != null)
    : [];
  if (options.length === 0) return null;
  return {
    id,
    label: humanLabel(row.label, `Q${index + 1}`),
    prompt,
    options,
    allowOther: row.allowOther !== false,
  };
}

function parseOption(raw: unknown, index: number): QuestionnaireOption | null {
  if (typeof raw === 'string') {
    const label = raw.trim();
    if (!label) return null;
    return { value: label, label };
  }
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const label = humanLabel(row.label, '');
  const value = String(row.value || label).trim();
  if (!label && !value) return null;
  const description =
    typeof row.description === 'string' && row.description.trim()
      ? row.description.trim()
      : undefined;
  return {
    value: value || `opt-${index + 1}`,
    label: label || `Option ${index + 1}`,
    description,
  };
}

export function formatQuestionnaireResult(
  questions: QuestionnaireQuestion[],
  answers: QuestionnaireAnswer[],
  cancelled: boolean,
): string {
  if (cancelled) return 'User cancelled the questionnaire';
  return answers
    .map((answer) => {
      const question = questions.find((row) => row.id === answer.id);
      const qLabel = question?.label || answer.id;
      if (answer.wasCustom) return `${qLabel}: user wrote: ${answer.label}`;
      const index = answer.index ? `${answer.index}. ` : '';
      return `${qLabel}: user selected: ${index}${answer.label}`;
    })
    .join('\n');
}

export function parsePlanTodos(raw: unknown): PlanTodo[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        return { step: index + 1, text, completed: false };
      }
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const text = String(row.text || '').trim();
      if (!text) return null;
      const step = Number(row.step);
      return {
        step: Number.isFinite(step) && step > 0 ? step : index + 1,
        text,
        completed: row.completed === true,
      };
    })
    .filter((row): row is PlanTodo => row != null)
    .slice(0, 24);
}

const PLAN_STEP_RE = /^\s{0,3}(\d+)[.)]\s+\*{0,2}([^*\n]+)/;
const PLAN_CHECK_RE = /^\s{0,3}[-*•]\s+\[[ xX]\]\s+(.+)/;
const PLAN_HEADER_RE = /\*{0,2}#{0,3}\s*plan\s*:?\*{0,2}\s*\n/i;
const PLAN_OFFER_RE =
  /(apruebas el plan|approve the plan|cuando me digas .{0,12}ejecuta|say .{0,12}execute|dime .{0,8}ejecuta)/i;

function numberedItemsFrom(source: string): PlanTodo[] {
  const items: PlanTodo[] = [];
  for (const line of String(source || '').split('\n')) {
    const match = PLAN_STEP_RE.exec(line);
    if (!match) continue;
    const textLine = match[2].replace(/\*{1,2}$/, '').trim();
    if (textLine.length < 3) continue;
    items.push({ step: items.length + 1, text: textLine, completed: false });
  }
  return items.slice(0, 24);
}

function checkboxItemsFrom(source: string): PlanTodo[] {
  const items: PlanTodo[] = [];
  for (const line of String(source || '').split('\n')) {
    const match = PLAN_CHECK_RE.exec(line);
    if (!match) continue;
    const textLine = match[1].replace(/\*{1,2}/g, '').trim();
    if (textLine.length < 3) continue;
    items.push({ step: items.length + 1, text: textLine, completed: false });
  }
  return items.slice(0, 24);
}

export function looksLikePlanOffer(text: string): boolean {
  return PLAN_OFFER_RE.test(String(text || ''));
}

export function extractPlanTodoItems(text: string): PlanTodo[] {
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
    const title = extractPlanTitle(source);
    return [{ step: 1, text: title, completed: false }];
  }
  return [];
}

export function extractPlanTitle(text: string): string {
  const source = String(text || '');
  const heading = source.match(/^\s{0,3}#{1,3}\s+(.+)$/m);
  if (heading?.[1]) {
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

export function extractPlanExcerpt(text: string, todos: PlanTodo[] = []): string {
  const compact = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length >= 24) return compact.slice(0, MAX_PLAN_EXCERPT_CHARS);
  if (todos.length > 0) return todos.map((item) => item.text).join(' · ').slice(0, MAX_PLAN_EXCERPT_CHARS);
  return compact.slice(0, MAX_PLAN_EXCERPT_CHARS);
}

export function extractMermaidDiagrams(markdown: string): string[] {
  const source = String(markdown || '');
  const diagrams: string[] = [];
  const fence = /```mermaid\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null = fence.exec(source);
  while (match) {
    const code = String(match[1] || '').trim();
    if (code) diagrams.push(code);
    match = fence.exec(source);
  }
  return diagrams;
}

export function extractPlanDocument(text: string): PlanDocument | null {
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

export function parsePlanDocument(raw: unknown): PlanDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const todos = parsePlanTodos(row.todos);
  const body = String(row.body || '').trim().slice(0, MAX_PLAN_BODY_CHARS);
  const title = String(row.title || '').trim().slice(0, 80);
  if (todos.length === 0 && !body) return null;
  return {
    title: title || extractPlanTitle(body) || 'Plan',
    body,
    excerpt: extractPlanExcerpt(String(row.excerpt || body), todos),
    todos,
  };
}

export function extractDoneSteps(text: string): number[] {
  const steps: number[] = [];
  for (const match of String(text || '').matchAll(/\[DONE:(\d+)\]/gi)) {
    const step = Number(match[1]);
    if (Number.isFinite(step)) steps.push(step);
  }
  return steps;
}

export function markCompletedSteps(text: string, items: PlanTodo[]): PlanTodo[] {
  const done = new Set(extractDoneSteps(text));
  if (done.size === 0) return items;
  return items.map((item) => (done.has(item.step) ? { ...item, completed: true } : item));
}

export function remainingPlanTodos(items: PlanTodo[]): PlanTodo[] {
  return items.filter((item) => !item.completed);
}

export function formatExecutePrompt(items: PlanTodo[], body?: string): string {
  const remaining = remainingPlanTodos(items);
  const first = remaining[0];
  const list = remaining.map((item) => `${item.step}. ${item.text}`).join('\n');
  const start = first ? `\nStart with: ${first.text}` : '';
  const planBlock = String(body || '').trim()
    ? `\n\nPlan:\n${String(body).trim().slice(0, MAX_PLAN_BODY_CHARS)}`
    : '';
  return `Execute the plan.${planBlock}\n\nRemaining steps:\n${list}${start}\nAfter completing a step, include a [DONE:n] tag in your response.`;
}

export function formatRefinePrompt(items: PlanTodo[], refinement: string, body?: string): string {
  const list = items.map((item) => `${item.step}. ${item.text}`).join('\n');
  const planBlock = String(body || '').trim()
    ? `\n\nPlan:\n${String(body).trim().slice(0, MAX_PLAN_BODY_CHARS)}`
    : `\n\nCurrent plan:\n${list}`;
  return `${String(refinement || '').trim()}${planBlock}`;
}

export function formatPlanAskPrompt(
  document: Pick<PlanDocument, 'title' | 'body' | 'todos'>,
  request: string,
  step?: PlanTodo | null,
): string {
  const focus = step ? `\nFocus on step ${step.step}: ${step.text}\n` : '';
  return formatRefinePrompt(document.todos, `${String(request || '').trim()}${focus}`, document.body);
}

export function questionnaireFromActionRequests(
  actionRequests: Array<{ name?: string; args?: unknown }> | null | undefined,
): QuestionnaireQuestion[] {
  const request = (actionRequests || []).find((row) => isQuestionnaireTool(row?.name));
  return parseQuestionnaireQuestions(request?.args);
}

export function isQuestionnaireTool(name: unknown): boolean {
  return String(name || '').trim() === QUESTIONNAIRE_TOOL_NAME;
}

export const QUESTIONNAIRE_TOOL_DEFINITION = {
  type: 'function' as const,
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

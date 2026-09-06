import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { getToolDisplayLabelForCall } from '@/lib/chat/toolDisplayLabels';
import { renderToolSuccessHighlight } from '@/lib/chat/toolResultHighlights';
import { useInspectStore, type InspectToolCall } from '@/lib/store/useInspectStore';
import {
  isPeopleInspectTool,
  isToolDefinitionInspect,
  parsePeopleToolResult,
  parseToolDefinitionResult,
  type PeopleToolRow,
} from '@/components/chat/tool-card/toolResultParsers';
import { formatToolArgValue, PeekDefinitionList, type PeekDefinitionItem } from './PeekDefinitionList';

type ResultViews = {
  peopleView: ReturnType<typeof parsePeopleToolResult>;
  definitionView: ReturnType<typeof parseToolDefinitionResult>;
  highlight: ReturnType<typeof renderToolSuccessHighlight>;
};

function buildArgItems(toolCall: InspectToolCall): PeekDefinitionItem[] {
  return Object.entries(toolCall.arguments ?? {}).map(([key, value]) => ({
    key,
    value: formatToolArgValue(value),
  }));
}

function computeResultViews(toolCall: InspectToolCall, t: TFunction): ResultViews {
  const peopleView = isPeopleInspectTool(toolCall.name)
    ? parsePeopleToolResult(toolCall.result)
    : null;
  const definitionView = isToolDefinitionInspect(toolCall.name)
    ? parseToolDefinitionResult(toolCall.result)
    : null;
  const highlight =
    !peopleView && !definitionView
      ? renderToolSuccessHighlight(toolCall.name, toolCall.result, t)
      : null;
  return { peopleView, definitionView, highlight };
}

function stringifyResult(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function PeopleRowCard({ row, t }: { row: PeopleToolRow; t: TFunction }) {
  const items: PeekDefinitionItem[] = [
    { key: t('people.display_name_label'), value: row.displayName },
  ];
  if (row.email) items.push({ key: t('inspect.email'), value: row.email });
  if (row.leadStatus) {
    items.push({
      key: t('inspect.lead_status'),
      value: t(`people.lead_status_${row.leadStatus}`, { defaultValue: row.leadStatus }),
    });
  }
  for (const identity of row.identities) {
    items.push({
      key: identity.source.replace(/_/g, ' ') || t('inspect.identities'),
      value: identity.label,
    });
  }
  return (
    <div className="flex flex-col gap-2">
      <PeekDefinitionList items={items} />
      {row.personId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            useInspectStore.getState().open({
              kind: 'person',
              personId: row.personId as string,
              title: row.displayName,
            });
          }}
        >
          {t('inspect.open_in_people')}
        </Button>
      ) : null}
    </div>
  );
}

function ResultSection({
  views,
  rawJson,
  showJson,
  onToggleJson,
  t,
}: {
  views: ResultViews;
  rawJson: string;
  showJson: boolean;
  onToggleJson: () => void;
  t: TFunction;
}) {
  const { peopleView, definitionView, highlight } = views;
  const hasStructuredView = peopleView || definitionView || highlight;
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('inspect.tool_result')}
      </h4>
      {peopleView ? (
        <div className="flex flex-col gap-3">
          {peopleView.rows.map((row, index) => (
            <div key={`${row.displayName}:${index}`} className="flex flex-col gap-2">
              <PeopleRowCard row={row} t={t} />
            </div>
          ))}
        </div>
      ) : null}
      {definitionView ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{definitionView.name}</p>
          {definitionView.description ? (
            <p className="text-xs text-muted-foreground">{definitionView.description}</p>
          ) : null}
        </div>
      ) : null}
      {highlight ? <div>{highlight}</div> : null}
      {!hasStructuredView && rawJson ? (
        <pre className="max-h-64 overflow-x-auto overflow-y-auto break-words rounded-lg bg-muted px-2.5 py-2 font-mono text-xs whitespace-pre-wrap">
          {rawJson}
        </pre>
      ) : null}
      {rawJson && hasStructuredView ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="h-auto self-start px-0 py-0 font-mono text-[11px] text-muted-foreground underline opacity-70 hover:opacity-100"
            onClick={onToggleJson}
          >
            {showJson ? t('inspect.hide_json') : t('inspect.view_json')}
          </Button>
          {showJson ? (
            <pre className="max-h-64 overflow-x-auto overflow-y-auto break-words rounded-lg bg-muted px-2.5 py-2 font-mono text-xs whitespace-pre-wrap">
              {rawJson}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ToolPeekBody({ toolCall }: { toolCall: InspectToolCall }) {
  const { t } = useTranslation();
  const [showJson, setShowJson] = useState(false);
  const label = getToolDisplayLabelForCall(toolCall, t);
  const argItems = buildArgItems(toolCall);
  const views = computeResultViews(toolCall, t);
  const rawJson = stringifyResult(toolCall.result);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm font-medium">{label}</p>
      {toolCall.error ? (
        <p className="text-xs text-destructive">{toolCall.error}</p>
      ) : null}
      {argItems.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('inspect.tool_args')}
          </h4>
          <PeekDefinitionList items={argItems} />
        </section>
      ) : null}
      <ResultSection
        views={views}
        rawJson={rawJson}
        showJson={showJson}
        onToggleJson={() => setShowJson((open) => !open)}
        t={t}
      />
    </div>
  );
}
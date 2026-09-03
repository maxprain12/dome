import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getToolDisplayLabelForCall } from '@/lib/chat/toolDisplayLabels';
import { renderToolSuccessHighlight } from '@/lib/chat/toolResultHighlights';
import { useInspectStore, type InspectToolCall } from '@/lib/store/useInspectStore';
import {
  isPeopleInspectTool,
  isToolDefinitionInspect,
  parsePeopleToolResult,
  parseToolDefinitionResult,
} from '@/components/chat/tool-card/toolResultParsers';
import { formatToolArgValue, PeekDefinitionList } from './PeekDefinitionList';

export function ToolPeekBody({ toolCall }: { toolCall: InspectToolCall }) {
  const { t } = useTranslation();
  const [showJson, setShowJson] = useState(false);
  const label = getToolDisplayLabelForCall(toolCall, t);
  const argItems = Object.entries(toolCall.arguments ?? {}).map(([key, value]) => ({
    key,
    value: formatToolArgValue(value),
  }));

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

  const rawJson = (() => {
    if (toolCall.result == null) return '';
    if (typeof toolCall.result === 'string') return toolCall.result;
    try {
      return JSON.stringify(toolCall.result, null, 2);
    } catch {
      return String(toolCall.result);
    }
  })();

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

      <section className="flex flex-col gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('inspect.tool_result')}
        </h4>
        {peopleView ? (
          <div className="flex flex-col gap-3">
            {peopleView.rows.map((row, index) => (
              <div key={`${row.displayName}:${index}`} className="flex flex-col gap-2">
                <PeekDefinitionList
                  items={[
                    { key: t('people.display_name_label'), value: row.displayName },
                    ...(row.email ? [{ key: t('inspect.email'), value: row.email }] : []),
                    ...(row.leadStatus
                      ? [{
                          key: t('inspect.lead_status'),
                          value: t(`people.lead_status_${row.leadStatus}`, {
                            defaultValue: row.leadStatus,
                          }),
                        }]
                      : []),
                    ...row.identities.map((identity) => ({
                      key: identity.source.replace(/_/g, ' ') || t('inspect.identities'),
                      value: identity.label,
                    })),
                  ]}
                />
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

        {!peopleView && !definitionView && !highlight && rawJson ? (
          <pre className="max-h-64 overflow-x-auto overflow-y-auto break-words rounded-lg bg-muted px-2.5 py-2 font-mono text-xs whitespace-pre-wrap">
            {rawJson}
          </pre>
        ) : null}

        {rawJson && (peopleView || definitionView || highlight) ? (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-auto self-start px-0 py-0 font-mono text-[11px] text-muted-foreground underline opacity-70 hover:opacity-100"
              onClick={() => setShowJson((open) => !open)}
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
    </div>
  );
}

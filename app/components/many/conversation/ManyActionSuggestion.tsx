import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  GithubIcon,
  Mail01Icon,
  Share01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import type { ActionSuggestion, ActionSuggestionKind } from '@/lib/many/actionSuggestions';
import { cn } from '@/lib/utils';

function kindIcon(kind: ActionSuggestionKind) {
  switch (kind) {
    case 'github_issue':
      return GithubIcon;
    case 'email':
      return Mail01Icon;
    case 'social_post':
      return Share01Icon;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function dispatchConfirm(text: string) {
  window.dispatchEvent(new CustomEvent('dome:quick-reply', { detail: { text } }));
}

interface ManyActionSuggestionProps {
  suggestion: ActionSuggestion;
  className?: string;
}

/**
 * Inline Codex-style draft card for GitHub / email / social tool intents.
 * Confirm emits dome:quick-reply (does not block the text stream).
 */
export default function ManyActionSuggestion({ suggestion, className }: ManyActionSuggestionProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const Icon = kindIcon(suggestion.kind);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/80 bg-card pl-1 shadow-sm',
        className,
      )}
      data-testid="many-action-suggestion"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary/50" />
      <div className="flex flex-col gap-2.5 p-3">
        <div className="flex items-start gap-2">
          <HugeiconsIcon icon={Icon} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('many.action_suggestion_label')}
            </p>
            <p className="mt-0.5 text-sm font-medium">{suggestion.title}</p>
          </div>
        </div>

        <dl className="flex flex-col gap-1.5 rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
          {suggestion.fields.map((field) => (
            <div key={`${suggestion.id}-${field.label}`} className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium capitalize text-muted-foreground">
                {field.label}
              </dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words">{field.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              dispatchConfirm(suggestion.confirmText);
              setDismissed(true);
            }}
          >
            <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" />
            {t('many.action_suggestion_confirm')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" />
            {t('many.action_suggestion_dismiss')}
          </Button>
        </div>
      </div>
    </div>
  );
}
